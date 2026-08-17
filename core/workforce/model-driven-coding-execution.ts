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
  constructor(
    private readonly machine:
      KingsCodingMachine,
    private readonly router:
      ModelRouter,
    private readonly providers:
      ProviderAdapterRegistry,
  ) {}

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
      !route.providerId ||
      !route.modelId
    ) {
      throw new Error(
        `K.I.N.G.S. Model Driven Coding: no model route is available. ${route.reason}`,
      );
    }

    const result =
      await this.providers.execute(
        route.providerId,
        route.modelId,
        request.modelRequest,
      );

    if (!result.success) {
      throw new Error(
        result.failure?.message ??
          "K.I.N.G.S. Model Driven Coding: model execution failed.",
      );
    }

    if (!result.response) {
      throw new Error(
        "K.I.N.G.S. Model Driven Coding: provider returned success without a model response.",
      );
    }

    return this.machine.executeCodingWorkUnitFromModel(
      {
        ...request.machineRequest,
        modelResult:
          result,
      },
      editor,
      buildTestOptions,
    );
  }
}
