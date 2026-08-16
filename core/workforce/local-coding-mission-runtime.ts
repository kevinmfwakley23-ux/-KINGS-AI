import type { ID } from "./types";

import {
  ModelDrivenWorkflowExecutor,
  type ModelDrivenWorkflowRequest,
  type ModelDrivenWorkflowResult,
} from "./model-driven-workflow-executor";


import {
  TargetAwareLocalCodingWorkflowExecutor,
} from "./target-aware-local-coding-workflow-executor";

import {
  LocalCodingEngineeringStepExecutor,
} from "./local-coding-engineering-step-executor";

import {
  LocalCodingEngineeringExecutor,
} from "./local-coding-engineering-executor";

import {
  EngineeringStepExecutor,
} from "./engineering-step-executor";

import {
  LocalCodingWorker,
} from "./local-coding-worker";

export interface LocalCodingMissionRuntimeRequest {
  id: ID;
  missionId: ID;
  objective: string;
  context: string;
  workUnits: ModelDrivenWorkflowRequest["workUnits"];
  executor: ModelDrivenWorkflowRequest["executor"];
  model: ModelDrivenWorkflowRequest["model"];
}

export interface LocalCodingMissionRuntimeResult {
  success: boolean;
  missionId: ID;
  workflow: ModelDrivenWorkflowResult;
  evidence: readonly string[];
}

export interface LocalCodingMissionRuntimeOptions {
  workflowExecutor?: ModelDrivenWorkflowExecutor;
  codingExecutor?: TargetAwareLocalCodingWorkflowExecutor;
}

export class LocalCodingMissionRuntime {
  private readonly workflowExecutor: ModelDrivenWorkflowExecutor;
  private readonly codingExecutor: TargetAwareLocalCodingWorkflowExecutor;

  constructor(
    options: LocalCodingMissionRuntimeOptions = {},
  ) {
    this.workflowExecutor =
      options.workflowExecutor ??
      new ModelDrivenWorkflowExecutor();

    this.codingExecutor =
      options.codingExecutor ??
      new TargetAwareLocalCodingWorkflowExecutor();
  }

  async execute(
    request: LocalCodingMissionRuntimeRequest,
  ): Promise<LocalCodingMissionRuntimeResult> {
    const workflow =
      await this.workflowExecutor.execute({
        id: request.id,
        missionId: request.missionId,
        objective: request.objective,
        workUnits: request.workUnits,
        executor: request.executor,
        model: request.model,

        codingExecutor:
          this.codingExecutor,

        workspacePath:
          process.env.KINGS_WORKSPACE ??
          process.cwd(),
      });

    const evidence = [
      "local-coding-runtime:started",
      "local-coding-runtime:model-driven",
      "local-coding-runtime:local-engineering-path",
      `mission:${request.missionId}`,
      `objective:${request.objective}`,
      ...workflow.evidence,
      workflow.success
        ? "local-coding-runtime:completed"
        : "local-coding-runtime:blocked",
    ];

    return {
      success: workflow.success,
      missionId: request.missionId,
      workflow,
      evidence,
    };
  }
}

export function createLocalCodingEngineeringStepExecutor(
  worker: LocalCodingWorker,
): LocalCodingEngineeringStepExecutor {
  return new LocalCodingEngineeringStepExecutor({
    worker,
  });
}

export function createLocalCodingEngineeringExecutor(
  worker: LocalCodingWorker,
): LocalCodingEngineeringExecutor {
  return new LocalCodingEngineeringExecutor({
    worker,
  });
}

export function createLocalEngineeringStepExecutor(): EngineeringStepExecutor {
  return new EngineeringStepExecutor();
}
