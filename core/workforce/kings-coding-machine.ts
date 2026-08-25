import type {
  ID,
  Mission,
} from "./types";

import {
  MissionContinuityStore,
  type MissionCheckpoint,
  type MissionPlan,
  type MissionState,
} from "./mission-continuity";

import {
  ProjectBrainCheckpointAdapter,
} from "./project-brain-checkpoint";

import {
  BuildPlanningAuthority,
  type BuildPlanningResult,
  type BuildPlanningRequest,
} from "./build-planner";

import {
  WorkflowPlanningAuthority,
} from "./workflow-planner";

import {
  WorkUnitRegistry,
} from "./work-unit-registry";

import type {
  WorkflowTaskValidationPort,
} from "./workflow-planner";

import {
  AutonomousEngineeringExecutionAuthority,
} from "./autonomous-engineering-execution";

import type {
  AutonomousEngineeringExecution,
  EngineeringExecutionRequest,
  EngineeringExecutionStep,
} from "./autonomous-engineering-execution";

import {
  EngineeringWorkspaceAuthority,
  type EngineeringWorkspace,
} from "./engineering-workspace";

import {
  EngineeringCommandBuilder,
} from "./engineering-command-builder";

import {
  EngineeringExecutionPipeline,
  type EngineeringExecutionPipelineRequest,
  type EngineeringExecutionPipelineResult,
} from "./engineering-execution-pipeline";

import type {
  EngineeringCommandExecutor,
} from "./engineering-execution-loop";

import type {
  EngineeringLanguage,
  EngineeringToolchain,
} from "./engineering-toolchain";

import {
  CodingWorkUnitExecutionAuthority,
  type CodingWorkUnitExecutionRequest,
  type CodingWorkUnitExecutionResult,
} from "./coding-work-unit-execution";

import {
  ModelCodingMachineBridge,
  type ModelCodingMachineBridgeRequest,
} from "./model-coding-machine-bridge";

import type {
  ModelExecutionResult,
} from "./model-interface";

import type {
  ModelCodingProposalParserOptions,
} from "./model-coding-proposal-parser";

import type {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import {
  CodingCapabilityGate,
} from "./coding-capability-gate";

import {
  EngineeringCapabilityOrchestrator,
} from "./engineering-capability-orchestrator";

import {
  EngineeringToolchainRegistry,
  createDefaultEngineeringToolchains,
} from "./engineering-toolchain";

import type {
  ToolchainProbe,
} from "./toolchain-verification";

export interface KingsCodingMissionRequest {
  mission: Mission;
  plan: MissionPlan;
}

export interface KingsCodingMachineSnapshot {
  mission: Mission;
  plan: MissionPlan;
  state: MissionState;
  latestCheckpoint?: MissionCheckpoint;
}

export interface KingsCodingMachineExecutionRequest {
  missionId: ID;
  projectId: ID;
  execution: AutonomousEngineeringExecution;
  step: EngineeringExecutionStep;
  workspace: EngineeringWorkspace;
  toolchain: EngineeringToolchain;
  completedAt: string;
  capabilityProbes?: ToolchainProbe[];
}

export interface KingsCodingMachineModelExecutionRequest {
  modelResult: ModelExecutionResult;
  proposalParser: ModelCodingProposalParserOptions;
  execution: Omit<CodingWorkUnitExecutionRequest, "proposal">;
}

export interface KingsCodingMachineExecutionResult {
  pipeline: EngineeringExecutionPipelineResult;
  execution: AutonomousEngineeringExecution;
  missionState: MissionState;
}

export class KingsCodingMachine {
  private readonly buildPlanner: BuildPlanningAuthority;
  private readonly engineeringExecution: AutonomousEngineeringExecutionAuthority;
  private readonly workspaceAuthority: EngineeringWorkspaceAuthority;
  private readonly commandBuilder: EngineeringCommandBuilder;
  private readonly executionPipeline: EngineeringExecutionPipeline;
  private readonly modelCodingBridge: ModelCodingMachineBridge;
  private readonly capabilityGate: CodingCapabilityGate;

  constructor(
    private readonly continuity: MissionContinuityStore = new MissionContinuityStore(),
    private readonly projectBrain: ProjectBrainCheckpointAdapter = new ProjectBrainCheckpointAdapter(continuity),
    taskControl: WorkflowTaskValidationPort,
    workUnits: WorkUnitRegistry = new WorkUnitRegistry(),
  ) {
    this.buildPlanner = new BuildPlanningAuthority(
      new WorkflowPlanningAuthority(taskControl),
      workUnits,
    );
    this.engineeringExecution = new AutonomousEngineeringExecutionAuthority();
    this.workspaceAuthority = new EngineeringWorkspaceAuthority();
    this.commandBuilder = new EngineeringCommandBuilder();
    this.executionPipeline = new EngineeringExecutionPipeline();
    this.modelCodingBridge = new ModelCodingMachineBridge();

    const toolchainRegistry = new EngineeringToolchainRegistry();
    for (const toolchain of createDefaultEngineeringToolchains()) {
      toolchainRegistry.register(toolchain);
    }

    const discovery = {
      async discover(language: EngineeringLanguage): Promise<EngineeringToolchain | undefined> {
        return createDefaultEngineeringToolchains().find(
          (candidate) => candidate.language === language,
        );
      },
    };

    this.capabilityGate = new CodingCapabilityGate(
      new EngineeringCapabilityOrchestrator(
        toolchainRegistry,
        discovery,
      ),
    );
  }

  startMission(request: KingsCodingMissionRequest): KingsCodingMachineSnapshot {
    this.continuity.registerMission(request.mission);
    this.continuity.registerPlan(request.plan);
    return this.snapshot(request.mission.id);
  }

  approvePlan(missionId: ID): MissionPlan {
    return this.continuity.approvePlan(missionId);
  }

  lockPlan(missionId: ID): MissionPlan {
    return this.continuity.lockPlan(missionId);
  }

  snapshot(missionId: ID): KingsCodingMachineSnapshot {
    const snapshot = this.continuity.snapshot(missionId);
    return {
      mission: snapshot.mission,
      plan: snapshot.plan,
      state: snapshot.state,
      latestCheckpoint: snapshot.latestCheckpoint,
    };
  }

  setTaskRunning(missionId: ID, taskId: ID): MissionState {
    const current = this.requireState(missionId);
    if (current.completedTaskIds.includes(taskId)) {
      throw new Error(`K.I.N.G.S. Coding Machine: task "${taskId}" is already completed`);
    }
    if (current.failedTaskIds.includes(taskId)) {
      throw new Error(`K.I.N.G.S. Coding Machine: task "${taskId}" is already failed; resume/retry must be explicit`);
    }

    const activeTaskIds = current.activeTaskIds.includes(taskId)
      ? current.activeTaskIds
      : [...current.activeTaskIds, taskId];

    return this.continuity.updateState(missionId, {
      activeTaskIds,
      failedTaskIds: current.failedTaskIds.filter((id) => id !== taskId),
    });
  }

  recordTaskFailure(missionId: ID, taskId: ID, diagnostics: string): MissionState {
    const current = this.requireState(missionId);
    const failedTaskIds = current.failedTaskIds.includes(taskId)
      ? current.failedTaskIds
      : [...current.failedTaskIds, taskId];

    const state = this.continuity.updateState(missionId, {
      activeTaskIds: current.activeTaskIds.filter((id) => id !== taskId),
      failedTaskIds,
    });

    const plan = this.continuity.getPlan(missionId);
    if (plan) {
      this.projectBrain.create({
        id: `checkpoint-failed-${taskId}-${Date.now()}`,
        missionId,
        planId: plan.id,
        planVersion: plan.version,
        state,
        summary: `Coding Work Unit "${taskId}" failed during governed execution.`,
        reason: diagnostics,
        createdAt: new Date().toISOString(),
      });
    }

    return state;
  }

  planMission(request: BuildPlanningRequest): BuildPlanningResult {
    const result = this.buildPlanner.plan(request);
    this.buildPlanner.bind(result);
    return result;
  }

  async executeCodingWorkUnit(
    request: CodingWorkUnitExecutionRequest,
    editor: EngineeringRepairEditor,
    buildTestOptions: ConstructorParameters<typeof CodingWorkUnitExecutionAuthority>[1],
  ): Promise<CodingWorkUnitExecutionResult> {
    const mission = this.continuity.getMission(request.projectId);
    const plan = this.continuity.getPlan(request.projectId);

    if (!mission || !plan) {
      throw new Error(`K.I.N.G.S. Coding Machine: mission "${request.projectId}" is not initialized`);
    }

    if (!plan.approvedByHuman || !plan.locked) {
      throw new Error("K.I.N.G.S. Coding Machine: coding work-unit execution requires an approved and locked mission plan");
    }

    const authority = new CodingWorkUnitExecutionAuthority(editor, buildTestOptions);
    const result = await authority.execute(request);
    const currentState = this.requireState(request.projectId);

    const evidenceId = `coding-verification-${request.taskId}`;
    const nextEvidenceIds = result.completed && !currentState.evidenceIds.includes(evidenceId)
      ? [...currentState.evidenceIds, evidenceId]
      : currentState.evidenceIds;

    const state = this.continuity.updateState(request.projectId, {
      activeTaskIds: currentState.activeTaskIds.filter((id) => id !== request.taskId),
      completedTaskIds: result.completed && !currentState.completedTaskIds.includes(request.taskId)
        ? [...currentState.completedTaskIds, request.taskId]
        : currentState.completedTaskIds,
      failedTaskIds: result.completed
        ? currentState.failedTaskIds.filter((id) => id !== request.taskId)
        : currentState.failedTaskIds.includes(request.taskId)
          ? currentState.failedTaskIds
          : [...currentState.failedTaskIds, request.taskId],
      evidenceIds: nextEvidenceIds,
    });

    const planNow = this.continuity.getPlan(request.projectId);
    if (!planNow) {
      throw new Error(`K.I.N.G.S. Coding Machine: mission "${request.projectId}" has no plan after coding execution`);
    }

    this.projectBrain.create({
      id: `checkpoint-coding-${request.taskId}-${Date.now()}`,
      missionId: request.projectId,
      planId: planNow.id,
      planVersion: planNow.version,
      state,
      summary: result.completed
        ? `Coding Work Unit "${request.taskId}" completed and verified.`
        : `Coding Work Unit "${request.taskId}" failed verification.`,
      reason: result.failureDiagnostics ?? (result.completed
        ? "Governed coding execution completed successfully."
        : "Governed coding execution produced a non-completed result."),
      createdAt: new Date().toISOString(),
    });

    return result;
  }

  async executeCodingWorkUnitFromModel(
    input: KingsCodingMachineModelExecutionRequest,
    editor: EngineeringRepairEditor,
    buildTestOptions: ConstructorParameters<typeof CodingWorkUnitExecutionAuthority>[1],
  ): Promise<CodingWorkUnitExecutionResult> {
    const bridgeInput: ModelCodingMachineBridgeRequest = {
      modelResult: input.modelResult,
      proposalParser: input.proposalParser,
      execution: input.execution,
    };

    const bridged = this.modelCodingBridge.buildRequest(bridgeInput);
    return this.executeCodingWorkUnit(bridged.request, editor, buildTestOptions);
  }

  async executeEngineeringStep(
    request: KingsCodingMachineExecutionRequest,
    executor: EngineeringCommandExecutor,
  ): Promise<KingsCodingMachineExecutionResult> {
    const mission = this.continuity.getMission(request.missionId);
    const plan = this.continuity.getPlan(request.missionId);

    if (!mission || !plan) {
      throw new Error(`K.I.N.G.S. Coding Machine: mission "${request.missionId}" is not initialized`);
    }

    if (!plan.approvedByHuman || !plan.locked) {
      throw new Error("K.I.N.G.S. Coding Machine: engineering execution requires an approved and locked mission plan");
    }

    if (request.execution.projectId !== request.projectId) {
      throw new Error("K.I.N.G.S. Coding Machine: engineering execution project mismatch");
    }

    if (request.step.id !== request.execution.currentStepId) {
      throw new Error("K.I.N.G.S. Coding Machine: requested engineering step is not the current governed step");
    }

    const capability = await this.capabilityGate.check({
      language: request.step.language as EngineeringLanguage,
      operations: [request.step.operation],
      probes: request.capabilityProbes ?? [
        {
          executable: request.toolchain.commands.find(
            (command) => command.operation === request.step.operation,
          )?.command ?? "",
          available: true,
        },
      ],
    });

    if (!capability.ready) {
      throw new Error(
        `K.I.N.G.S. Coding Machine: coding capability gate blocked execution. ${capability.reason}`,
      );
    }

    const toolchain = capability.toolchain ?? request.toolchain;
    const command = this.workspaceAuthority.authorizeStep(request.workspace, request.execution, request.step);
    const built = this.commandBuilder.build({ command, toolchain });

    if (!built.authorized) {
      throw new Error(
        `K.I.N.G.S. Coding Machine: engineering command was not authorized. ${built.reason ?? "No authorization reason provided."}`,
      );
    }

    const executionRequest: EngineeringExecutionRequest = {
      id: request.execution.id,
      projectId: request.projectId,
      profile: {
        id: `profile-${request.projectId}-${request.step.id}`,
        projectPath: request.workspace.rootPath,
        languages: [
          {
            language: request.step.language as EngineeringLanguage,
            fileCount: 0,
            extensions: [],
          },
        ],
        requiredOperations: [request.step.operation],
        verifiedToolchains: [],
        unsupportedLanguages: [],
        buildReady: true,
        testReady: true,
        debugReady: true,
      },
      plan: {
        id: request.execution.id,
        projectId: request.projectId,
        blocked: false,
        blockReasons: [],
        requirements: [
          {
            language: request.step.language,
            operations: [request.step.operation],
            required: true,
          },
        ],
        capabilityIds: [`engineering-${request.step.language}`],
      },
    };

    const plannedExecution = this.engineeringExecution.plan(executionRequest);
    const governedStep = plannedExecution.steps[0];

    if (!governedStep) {
      throw new Error(
        `K.I.N.G.S. Coding Machine: execution plan produced no step for task "${request.step.id}"`,
      );
    }

    const pipelineRequest: EngineeringExecutionPipelineRequest = {
      request: {
        id: built.id,
        projectId: request.projectId,
        executionId: plannedExecution.id,
        step: governedStep,
        command: built,
      },
      execution: plannedExecution,
      completedAt: request.completedAt,
    };

    const pipeline = await this.executionPipeline.execute(pipelineRequest, executor);
    const execution = pipeline.step.completed
      ? this.engineeringExecution.completeStep(plannedExecution, governedStep.id)
      : { ...plannedExecution, status: "failed" as const };

    return {
      pipeline,
      execution,
      missionState: this.continuity.getState(request.missionId) ??
        (() => { throw new Error(`K.I.N.G.S. Coding Machine: mission "${request.missionId}" has no execution state`); })(),
    };
  }

  private requireState(missionId: ID): MissionState {
    const state = this.continuity.getState(missionId);
    if (!state) {
      throw new Error(`K.I.N.G.S. Coding Machine: mission "${missionId}" has no execution state`);
    }
    return state;
  }
}
