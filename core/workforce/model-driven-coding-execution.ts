import type {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import type {
  CodingWorkUnitExecutionResult,
} from "./coding-work-unit-execution";

import type {
  ModelExecutionRequest,
} from "./model-interface";

import {
  ModelRouter,
  type ModelRoutingRequest,
} from "./model-routing";

import type {
  ProviderAdapterRegistry,
} from "./provider-adapters";

import {
  ResilientModelExecutionAuthority,
} from "./resilient-model-execution";

import {
  KingsCodingMachine,
  type KingsCodingMachineModelExecutionRequest,
} from "./kings-coding-machine";

export interface ModelDrivenCodingExecutionRequest {
  modelRequest:
    ModelExecutionRequest;

  routing:
    ModelRoutingRequest;

  machineRequest:
    Omit<
      KingsCodingMachineModelExecutionRequest,
      "modelResult"
    >;
}

export class ModelDrivenCodingExecutionAuthority {
  private readonly resilientExecution:
    ResilientModelExecutionAuthority;

  constructor(
    private readonly machine:
      KingsCodingMachine,
    private readonly router:
      ModelRouter,
    private readonly providers:
      ProviderAdapterRegistry,
    resilientExecution?:
      ResilientModelExecutionAuthority,
  ) {
    this.resilientExecution =
      resilientExecution ??
      new ResilientModelExecutionAuthority(
        providers,
      );
  }

  async execute(
    request:
      ModelDrivenCodingExecutionRequest,
    editor:
      EngineeringRepairEditor,
    buildTestOptions:
      ConstructorParameters<
        typeof import("./coding-work-unit-execution").CodingWorkUnitExecutionAuthority
      >[1],
  ):
    Promise<CodingWorkUnitExecutionResult> {
    const route =
      this.router.route(
        request.routing,
      );

    if (
      !route.selected ||
      route.candidates.length === 0
    ) {
      throw new Error(
        `K.I.N.G.S. Model Driven Coding: no model route is available. ${route.reason}`,
      );
    }

    const execution =
      await this.resilientExecution.execute(
        route.candidates,
        request.modelRequest,
      );

    if (!execution.result.success) {
      const attemptSummary =
        execution.attempts
          .map(
            (attempt) =>
              `${attempt.providerId}/${attempt.modelId}:${attempt.skipped ? "skipped" : attempt.failureCode ?? "failed"}`,
          )
          .join(", ");

      throw new Error(
        execution.result.failure?.message ??
          `K.I.N.G.S. Model Driven Coding: all routed model executions failed.${attemptSummary ? ` Attempts: ${attemptSummary}` : ""}`,
      );
    }

    if (!execution.result.response) {
      throw new Error(
        "K.I.N.G.S. Model Driven Coding: provider returned success without a model response.",
      );
    }

    return this.machine.executeCodingWorkUnitFromModel(
      {
        ...request.machineRequest,
        modelResult:
          execution.result,
      },
      editor,
      buildTestOptions,
    );
  }
}
