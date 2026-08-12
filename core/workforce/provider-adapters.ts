import type {
  ID,
} from "./types";

import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
  IntelligenceProviderKind,
} from "./model-interface";

export interface ProviderDescriptor {
  id: ID;
  name: string;
  kind: IntelligenceProviderKind;
  available: boolean;
}

export interface ProviderAdapter {
  readonly descriptor: ProviderDescriptor;

  listModels(): readonly ModelIdentity[];

  getModel(
    modelId: ID,
  ): IntelligenceModel | undefined;

  execute(
    modelId: ID,
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult>;
}

export class ProviderAdapterRegistry {
  private readonly adapters =
    new Map<ID, ProviderAdapter>();

  register(
    adapter: ProviderAdapter,
  ): void {
    if (
      this.adapters.has(
        adapter.descriptor.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Provider Registry: provider "${adapter.descriptor.id}" is already registered`,
      );
    }

    this.adapters.set(
      adapter.descriptor.id,
      adapter,
    );
  }

  get(
    providerId: ID,
  ): ProviderAdapter | undefined {
    return this.adapters.get(
      providerId,
    );
  }

  list(): readonly ProviderDescriptor[] {
    return Array.from(
      this.adapters.values(),
    )
      .map(
        (adapter) =>
          adapter.descriptor,
      )
      .sort(
        (left, right) =>
          left.id.localeCompare(
            right.id,
          ),
      );
  }

  listAvailable(): readonly ProviderDescriptor[] {
    return this.list().filter(
      (provider) =>
        provider.available,
    );
  }

  execute(
    providerId: ID,
    modelId: ID,
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    const adapter =
      this.adapters.get(
        providerId,
      );

    if (!adapter) {
      return Promise.resolve({
        success: false,
        failure: {
          requestId:
            request.id,
          providerId,
          modelId,
          retryable: false,
          code:
            "PROVIDER_NOT_REGISTERED",
          message:
            `Provider "${providerId}" is not registered.`,
          metadata: {
            requestId:
              request.id,
            startedAt:
              new Date().toISOString(),
            completedAt:
              new Date().toISOString(),
            latencyMs: 0,
          },
        },
      });
    }

    if (
      !adapter.descriptor.available
    ) {
      return Promise.resolve({
        success: false,
        failure: {
          requestId:
            request.id,
          providerId,
          modelId,
          retryable: true,
          code:
            "PROVIDER_UNAVAILABLE",
          message:
            `Provider "${providerId}" is unavailable.`,
          metadata: {
            requestId:
              request.id,
            startedAt:
              new Date().toISOString(),
            completedAt:
              new Date().toISOString(),
            latencyMs: 0,
          },
        },
      });
    }

    return adapter.execute(
      modelId,
      request,
    );
  }
}
