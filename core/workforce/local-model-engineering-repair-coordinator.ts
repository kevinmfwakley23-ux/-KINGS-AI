import type {
  EngineeringFailureRecoveryPolicy,
} from "./engineering-failure-recovery";

import {
  EngineeringRepairWorkspaceProposalAuthority,
  type EngineeringRepairWorkspaceProposalResult,
} from "./engineering-repair-workspace-proposal";

import type {
  EngineeringWorkspace,
} from "./engineering-workspace";

import {
  GovernedLocalCodingProposal,
} from "./local-coding-change-proposal";

import {
  LocalCodingJsonProposalParser,
} from "./local-coding-json-proposal-parser";

import {
  buildLocalCodingRepairRequest,
  type LocalCodingRepairContextFile,
} from "./local-coding-repair-request";

import {
  LocalEngineeringRecoveryBridge,
  type LocalEngineeringRecoveryResult,
} from "./local-engineering-recovery-bridge";

import {
  LocalEngineeringRecoveryCycle,
  type LocalEngineeringRecoveryCycleResult,
} from "./local-engineering-recovery-cycle";

import type {
  LocalEngineeringExecutionReport,
} from "./local-engineering-execution-runner";

import type {
  LocalProjectEngineeringReadinessResult,
} from "./local-project-engineering-readiness";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

export interface LocalRepairModelExecutionPort {
  execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult>;
}

export interface LocalModelEngineeringRepairRequest {
  readiness: LocalProjectEngineeringReadinessResult;
  report: LocalEngineeringExecutionReport;
  workspace: EngineeringWorkspace;
  objective: string;
  allowedPaths: readonly string[];
  contextFiles?: readonly LocalCodingRepairContextFile[];
  attemptNumber: number;
  policy: EngineeringFailureRecoveryPolicy;
  authorized: boolean;
  timeoutMs?: number;
  completedAt?: string;
  maxOutputTokens?: number;
}

export interface LocalModelEngineeringRepairResult {
  status: "completed" | "failed" | "blocked";
  verified: boolean;
  modelInvoked: boolean;
  initialRecovery: LocalEngineeringRecoveryResult;
  modelRequest?: ModelExecutionRequest;
  modelResult?: ModelExecutionResult;
  proposal?: EngineeringRepairWorkspaceProposalResult;
  cycle: LocalEngineeringRecoveryCycleResult;
  failureReason?: string;
}

/**
 * Production coordinator for one bounded AI-assisted local repository recovery
 * attempt. It does not create a new retry policy and does not let a model write
 * files. The model only returns a bounded JSON proposal. That proposal must pass
 * the strict parser, mission/task allow-list authority, active workspace policy,
 * rollback-safe writer, and real repository-native retest before completion.
 */
export class LocalModelEngineeringRepairCoordinator {
  private readonly recovery = new LocalEngineeringRecoveryBridge();
  private readonly parser = new LocalCodingJsonProposalParser();
  private readonly governedProposal = new GovernedLocalCodingProposal();
  private readonly workspaceProposal =
    new EngineeringRepairWorkspaceProposalAuthority();

  constructor(
    private readonly model: LocalRepairModelExecutionPort,
    private readonly cycle: LocalEngineeringRecoveryCycle,
  ) {}

  async execute(
    request: LocalModelEngineeringRepairRequest,
  ): Promise<LocalModelEngineeringRepairResult> {
    this.validateRequest(request);

    const completedAt = request.completedAt ?? new Date().toISOString();
    const initialRecovery = this.recovery.analyze({
      report: request.report,
      attemptNumber: request.attemptNumber,
      policy: request.policy,
      completedAt,
    });

    if (initialRecovery.analysis.action !== "repair") {
      const cycle = await this.cycle.execute({
        readiness: request.readiness,
        report: request.report,
        attemptNumber: request.attemptNumber,
        policy: request.policy,
        authorized: request.authorized,
        workspaceRoot: request.workspace.rootPath,
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        completedAt,
      });
      return {
        status: cycle.status,
        verified: cycle.verified,
        modelInvoked: false,
        initialRecovery,
        cycle,
        ...(cycle.failureReason ? { failureReason: cycle.failureReason } : {}),
      };
    }

    const editStep = initialRecovery.repairPlan.steps.find(
      (step) => step.strategy === "edit",
    );
    if (!editStep) {
      const cycle = await this.cycle.execute({
        readiness: request.readiness,
        report: request.report,
        attemptNumber: request.attemptNumber,
        policy: request.policy,
        authorized: request.authorized,
        workspaceRoot: request.workspace.rootPath,
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        completedAt,
      });
      return {
        status: "blocked",
        verified: false,
        modelInvoked: false,
        initialRecovery,
        cycle,
        failureReason:
          "Authorized repair analysis produced no governed edit step.",
      };
    }

    const modelRequest = buildLocalCodingRepairRequest({
      requestId: `repair-request-${sanitize(editStep.id)}`,
      taskId: editStep.id,
      missionId: initialRecovery.repairPlan.projectId,
      objective: request.objective,
      report: request.report,
      allowedPaths: request.allowedPaths,
      contextFiles: request.contextFiles,
      ...(request.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: request.maxOutputTokens }),
    });

    let modelResult: ModelExecutionResult;
    try {
      modelResult = await this.model.execute(modelRequest);
    } catch (error) {
      const cycle = await this.cycle.execute({
        readiness: request.readiness,
        report: request.report,
        attemptNumber: request.attemptNumber,
        policy: { ...request.policy, allowRepair: false },
        authorized: request.authorized,
        workspaceRoot: request.workspace.rootPath,
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        completedAt,
      });
      const failureReason =
        `Repair model execution failed before any repository mutation: ${error instanceof Error ? error.message : String(error)}`;
      return {
        status: "failed",
        verified: false,
        modelInvoked: true,
        initialRecovery,
        modelRequest,
        cycle,
        failureReason,
      };
    }

    let proposal: EngineeringRepairWorkspaceProposalResult;
    try {
      const parsed = this.governedProposal.propose(
        {
          response: modelResult,
          request: modelRequest,
          allowedPaths: request.allowedPaths,
        },
        this.parser,
      );
      proposal = this.workspaceProposal.authorize({
        step: editStep,
        workspace: request.workspace,
        proposal: parsed,
      });
    } catch (error) {
      const cycle = await this.cycle.execute({
        readiness: request.readiness,
        report: request.report,
        attemptNumber: request.attemptNumber,
        policy: { ...request.policy, allowRepair: false },
        authorized: request.authorized,
        workspaceRoot: request.workspace.rootPath,
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        completedAt,
      });
      const failureReason =
        `Repair proposal was rejected before any repository mutation: ${error instanceof Error ? error.message : String(error)}`;
      return {
        status: "blocked",
        verified: false,
        modelInvoked: true,
        initialRecovery,
        modelRequest,
        modelResult,
        cycle,
        failureReason,
      };
    }

    const cycle = await this.cycle.execute({
      readiness: request.readiness,
      report: request.report,
      attemptNumber: request.attemptNumber,
      policy: request.policy,
      authorized: request.authorized,
      workspaceRoot: request.workspace.rootPath,
      proposal,
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      completedAt,
    });

    return {
      status: cycle.status,
      verified: cycle.verified,
      modelInvoked: true,
      initialRecovery,
      modelRequest,
      modelResult,
      proposal,
      cycle,
      ...(cycle.failureReason ? { failureReason: cycle.failureReason } : {}),
    };
  }

  private validateRequest(
    request: LocalModelEngineeringRepairRequest,
  ): void {
    if (!request.objective.trim()) {
      throw new Error(
        "K.I.N.G.S. Local Model Engineering Repair: repair objective is required.",
      );
    }
    if (!request.workspace.active) {
      throw new Error(
        "K.I.N.G.S. Local Model Engineering Repair: engineering workspace is inactive.",
      );
    }
    if (request.workspace.projectId !== request.report.execution.projectId) {
      throw new Error(
        "K.I.N.G.S. Local Model Engineering Repair: workspace and failed execution belong to different projects.",
      );
    }
    if (request.readiness.execution.projectId !== request.report.execution.projectId) {
      throw new Error(
        "K.I.N.G.S. Local Model Engineering Repair: readiness and failure report belong to different projects.",
      );
    }
    if (!Array.isArray(request.allowedPaths) || request.allowedPaths.length < 1) {
      throw new Error(
        "K.I.N.G.S. Local Model Engineering Repair: at least one exact repair path is required.",
      );
    }
  }
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/gu, "-");
}
