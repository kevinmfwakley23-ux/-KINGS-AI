import type {
  ID,
} from "./types";

import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";

import type {
  ProviderAdapter,
} from "./provider-adapters";

export interface InternalModelExecutor {
  execute(
    model:
      ModelIdentity,
    request:
      ModelExecutionRequest,
  ):
    Promise<
      ModelExecutionResult
    >;
}

export class GovernedInternalIntelligenceAdapter
  implements ProviderAdapter {
  readonly descriptor = {
    id:
      "internal-intelligence",
    name:
      "K.I.N.G.S. Internal Intelligence",
    kind:
      "internal-local" as const,
    available:
      true,
  };

  private readonly models =
    new Map<
      ID,
      IntelligenceModel
    >();

  constructor(
    private readonly executor:
      InternalModelExecutor,
  ) {}

  registerModel(
    model:
      IntelligenceModel,
  ):
    void {
    if (
      model.identity.providerKind !==
      "internal-local" &&
      model.identity.providerKind !==
      "internal-self-hosted"
    ) {
      throw new Error(
        `K.I.N.G.S. Internal Intelligence: model "${model.identity.modelId}" is not an internal model`,
      );
    }

    if (
      model.identity.providerId !==
      this.descriptor.id
    ) {
      throw new Error(
        `K.I.N.G.S. Internal Intelligence: model "${model.identity.modelId}" must use provider "${this.descriptor.id}"`,
      );
    }

    if (
      this.models.has(
        model.identity.modelId,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Internal Intelligence: model "${model.identity.modelId}" is already registered`,
      );
    }

    this.models.set(
      model.identity.modelId,
      model,
    );
  }

  listModels():
    readonly ModelIdentity[] {
    return [
      ...this.models.values(),
    ]
      .map(
        (model) =>
          model.identity,
      )
      .sort(
        (left, right) =>
          left.modelId.localeCompare(
            right.modelId,
          ),
      );
  }

  getModel(
    modelId:
      ID,
  ):
    IntelligenceModel
    | undefined {
    return this.models.get(
      modelId,
    );
  }

  async execute(
    modelId:
      ID,
    request:
      ModelExecutionRequest,
  ):
    Promise<
      ModelExecutionResult
    > {
    const model =
      this.models.get(
        modelId,
      );

    if (!model) {
      return {
        success:
          false,
        failure: {
          requestId:
            request.id,
          providerId:
            this.descriptor.id,
          modelId,
          retryable:
            false,
          code:
            "INTERNAL_MODEL_NOT_REGISTERED",
          message:
            `Internal model "${modelId}" is not registered.`,
          metadata: {
            requestId:
              request.id,
            startedAt:
              new Date().toISOString(),
            completedAt:
              new Date().toISOString(),
            latencyMs:
              0,
          },
        },
      };
    }

    if (
      !model.identity.available
    ) {
      return {
        success:
          false,
        failure: {
          requestId:
            request.id,
          providerId:
            this.descriptor.id,
          modelId,
          retryable:
            true,
          code:
            "INTERNAL_MODEL_UNAVAILABLE",
          message:
            `Internal model "${modelId}" is unavailable.`,
          metadata: {
            requestId:
              request.id,
            startedAt:
              new Date().toISOString(),
            completedAt:
              new Date().toISOString(),
            latencyMs:
              0,
          },
        },
      };
    }

    if (
      !model.canHandle(
        request,
      )
    ) {
      return {
        success:
          false,
        failure: {
          requestId:
            request.id,
          providerId:
            this.descriptor.id,
          modelId,
          retryable:
            false,
          code:
            "INTERNAL_MODEL_CAPABILITY_MISMATCH",
          message:
            `Internal model "${modelId}" cannot satisfy the requested capabilities or modalities.`,
          metadata: {
            requestId:
              request.id,
            startedAt:
              new Date().toISOString(),
            completedAt:
              new Date().toISOString(),
            latencyMs:
              0,
          },
        },
      };
    }

    return this.executor.execute(
      model.identity,
      request,
    );
  }
}
