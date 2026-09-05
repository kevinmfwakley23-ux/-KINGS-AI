import type { ID } from "./types";
import type { WorkUnitContract } from "./work-unit-contract";
import type { LocalCodingChangeProposal } from "./local-coding-change-proposal";
import {
  EngineeringWorkspaceProposalAuthority,
  type EngineeringWorkspaceProposalResult,
} from "./engineering-workspace-proposal";
import type { EngineeringWorkspace } from "./engineering-workspace";
import {
  LocalCodingWriteBridge,
  type LocalCodingWriteResult,
} from "./local-coding-write-bridge";
import type { EngineeringRepairStep } from "./engineering-repair-planner";
import type { EngineeringRepairEditor } from "./engineering-repair-editor";
import {
  BuildTestExecutor,
  type BuildTestExecutionResult,
  type BuildTestStep,
} from "./build-test-executor";
import {
  EngineeringVerificationGateAuthority,
  type EngineeringVerificationGateResult,
} from "./engineering-verification-gate";
import {
  EngineeringCompletionAuthority,
  type EngineeringCompletionResult,
} from "./engineering-completion-authority";
import { EngineeringWorkspaceAuthority } from "./engineering-workspace";
import type { EngineeringCommandResult } from "./engineering-execution-loop";
import { planProjectVerification } from "./project-verification-planner";
import type { EngineeringToolchain } from "./engineering-toolchain";

export interface CodingWorkUnitExecutionRequest {
  taskId: ID;
  missionId?: ID;
  projectId: ID;
  workUnit: WorkUnitContract;
  proposal: LocalCodingChangeProposal;
  execution: Parameters<EngineeringWorkspaceProposalAuthority["authorize"]>[0]["execution"];
  step: Parameters<EngineeringWorkspaceProposalAuthority["authorize"]>[0]["step"];
  workspace: EngineeringWorkspace;
  repairStep: EngineeringRepairStep;
  buildTestSteps: BuildTestStep[];
  requiredCriteria: string[];
  autoPlanBuildTest?: boolean;
  failureDiagnostics?: string;
}

export interface CodingWorkUnitExecutionResult {
  taskId: ID;
  missionId: ID;
  projectId: ID;
  proposal: LocalCodingChangeProposal;
  authorizedProposal: EngineeringWorkspaceProposalResult;
  writes: LocalCodingWriteResult;
  buildTest: BuildTestExecutionResult;
  verification: EngineeringVerificationGateResult;
  completion: EngineeringCompletionResult;
  completed: boolean;
  failureDiagnostics?: string;
}

export class CodingWorkUnitExecutionAuthority {
  private readonly workspaceProposal: EngineeringWorkspaceProposalAuthority;
  private readonly writeBridge: LocalCodingWriteBridge;
  private readonly buildTest: BuildTestExecutor;
  private readonly verification: EngineeringVerificationGateAuthority;
  private readonly completion: EngineeringCompletionAuthority;
  private readonly projectVerificationToolchains: readonly EngineeringToolchain[];

  constructor(
    editor: EngineeringRepairEditor,
    buildTestOptions: ConstructorParameters<typeof BuildTestExecutor>[0],
  ) {
    this.workspaceProposal = new EngineeringWorkspaceProposalAuthority(
      new EngineeringWorkspaceAuthority(),
    );
    this.writeBridge = new LocalCodingWriteBridge(editor);
    this.buildTest = new BuildTestExecutor(buildTestOptions);
    this.verification = new EngineeringVerificationGateAuthority();
    this.completion = new EngineeringCompletionAuthority();
    this.projectVerificationToolchains = [
      ...(buildTestOptions.projectVerificationToolchains ?? []),
    ];
  }

  async execute(
    request: CodingWorkUnitExecutionRequest,
  ): Promise<CodingWorkUnitExecutionResult> {
    this.validateRequest(request);

    const missionId = this.resolveMissionId(request);
    const authorizedProposal = this.workspaceProposal.authorize({
      execution: request.execution,
      step: request.step,
      workspace: request.workspace,
      proposal: request.proposal,
    });

    const writes = await this.writeBridge.execute({
      step: request.repairStep,
      projectId: request.projectId,
      workspaceRoot: request.workspace.rootPath,
      proposal: authorizedProposal,
    });

    let buildTestSteps = request.buildTestSteps;

    if (request.autoPlanBuildTest) {
      const plan = await planProjectVerification({
        workspaceRoot: request.workspace.rootPath,
        requiredCriteria: request.requiredCriteria,
        changedPaths: authorizedProposal.changes.map((change) => change.path),
        toolchains: this.projectVerificationToolchains,
      });

      if (plan.steps.length === 0) {
        throw new Error(
          `K.I.N.G.S. Coding Work Unit Execution: no real verification steps could be planned for project kind "${plan.projectKind}".`,
        );
      }

      if (plan.uncoveredCriteria.length > 0) {
        throw new Error(
          `K.I.N.G.S. Coding Work Unit Execution: the generated project has no executable evidence for acceptance criteria: ${plan.uncoveredCriteria.join(" | ")}`,
        );
      }

      buildTestSteps = plan.steps;
    }

    this.assertCriteriaCovered(buildTestSteps, request.requiredCriteria);

    const buildTest = await this.buildTest.execute({
      taskId: request.taskId,
      workUnit: request.workUnit,
      steps: buildTestSteps,
      workspaceRoot: request.workspace.rootPath,
    });

    const commandResults: EngineeringCommandResult[] = buildTest.steps.map(
      (stepResult) => ({
        id: `build-test-${request.taskId}-${stepResult.step.id}`,
        commandId: stepResult.step.id,
        projectId: request.projectId,
        status: stepResult.passed ? "success" : "failed",
        exitCode: stepResult.execution.exitCode ?? -1,
        stdout: stepResult.execution.stdout,
        stderr: stepResult.execution.stderr,
        durationMs:
          new Date(stepResult.execution.completedAt).getTime() -
          new Date(stepResult.execution.startedAt).getTime(),
        completedAt: stepResult.execution.completedAt,
        verifiesCriteria: stepResult.step.verifiesCriteria
          ? [...stepResult.step.verifiesCriteria]
          : [],
      }),
    );

    const diagnostics =
      commandResults
        .filter((result) => result.status === "failed")
        .map((result) =>
          [
            `command=${result.commandId}`,
            `exitCode=${result.exitCode}`,
            `stdout=${result.stdout}`,
            `stderr=${result.stderr}`,
          ].join("\n"),
        )
        .join("\n\n") || undefined;

    const verification = this.verification.verify({
      projectId: request.projectId,
      requiredCriteria: request.requiredCriteria,
      commandResults,
      repairResults: [],
    });

    const completion = this.completion.complete({
      projectId: request.projectId,
      taskId: request.taskId,
      verification,
      requiredCriteria: request.requiredCriteria,
    });

    return {
      taskId: request.taskId,
      missionId,
      projectId: request.projectId,
      proposal: request.proposal,
      authorizedProposal,
      writes,
      buildTest,
      verification,
      completion,
      completed: completion.completed,
      failureDiagnostics: diagnostics,
    };
  }

  private validateRequest(request: CodingWorkUnitExecutionRequest): void {
    if (!request.taskId.trim()) {
      throw new Error("K.I.N.G.S. Coding Work Unit Execution: task id is required.");
    }
    if (request.missionId !== undefined && !request.missionId.trim()) {
      throw new Error("K.I.N.G.S. Coding Work Unit Execution: mission id cannot be blank.");
    }
    if (!request.projectId.trim()) {
      throw new Error("K.I.N.G.S. Coding Work Unit Execution: project id is required.");
    }
    if (request.execution.projectId !== request.projectId) {
      throw new Error("K.I.N.G.S. Coding Work Unit Execution: execution project does not match request project.");
    }
    if (request.workspace.projectId !== request.projectId) {
      throw new Error("K.I.N.G.S. Coding Work Unit Execution: workspace project does not match request project.");
    }
    if (request.workUnit.approved !== true) {
      throw new Error(
        `K.I.N.G.S. Coding Work Unit Execution: Work Unit "${request.workUnit.id}" is not approved.`,
      );
    }
    if (request.workUnit.allowedPaths.length === 0) {
      throw new Error("K.I.N.G.S. Coding Work Unit Execution: Work Unit has no authorized paths.");
    }
    if (request.proposal.taskId !== request.taskId) {
      throw new Error("K.I.N.G.S. Coding Work Unit Execution: proposal task does not match Work Unit task.");
    }
    if (request.proposal.missionId !== this.resolveMissionId(request)) {
      throw new Error("K.I.N.G.S. Coding Work Unit Execution: proposal mission does not match request mission.");
    }
    if (request.proposal.changes.length === 0) {
      throw new Error("K.I.N.G.S. Coding Work Unit Execution: proposal contains no file changes.");
    }
    if (!request.autoPlanBuildTest && request.buildTestSteps.length === 0) {
      throw new Error(
        "K.I.N.G.S. Coding Work Unit Execution: at least one build/test step is required unless project-aware verification planning is enabled.",
      );
    }
    if (request.requiredCriteria.length === 0) {
      throw new Error(
        "K.I.N.G.S. Coding Work Unit Execution: at least one verification criterion is required.",
      );
    }

    if (!request.autoPlanBuildTest) {
      this.assertCriteriaCovered(request.buildTestSteps, request.requiredCriteria);
    }
  }

  private assertCriteriaCovered(
    steps: readonly BuildTestStep[],
    criteria: readonly string[],
  ): void {
    const coveredCriteria = new Set(
      steps.flatMap((step) => step.verifiesCriteria ?? []),
    );
    const uncoveredCriterion = criteria.find(
      (criterion) => !coveredCriteria.has(criterion),
    );

    if (uncoveredCriterion) {
      throw new Error(
        `K.I.N.G.S. Coding Work Unit Execution: no build/test step explicitly verifies required criterion "${uncoveredCriterion}".`,
      );
    }
  }

  private resolveMissionId(request: CodingWorkUnitExecutionRequest): ID {
    return request.missionId ?? request.projectId;
  }
}
