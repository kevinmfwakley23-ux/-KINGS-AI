import type {
  ID,
} from "./types";

import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  IntelligenceCapability,
} from "./model-interface";

import {
  ProviderAdapterRegistry,
} from "./provider-adapters";

import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "./provider-adapters";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

class TestModel
  implements IntelligenceModel
{
  readonly identity = {
    providerId:
      "provider-test",
    modelId:
      "model-test",
    displayName:
      "K.I.N.G.S. Test Model",
    providerKind:
      "internal-local" as const,
    capabilities: [
      "reasoning",
      "coding",
    ] as readonly IntelligenceCapability[],
    inputModalities: [
      "text" as const,
    ],
    outputModalities: [
      "text" as const,
    ],
    contextWindowTokens:
      16_000,
    supportsToolCalling:
      true,
    supportsStructuredOutput:
      true,
    available:
      true,
  };

  canHandle(
    request: ModelExecutionRequest,
  ): boolean {
    return request.requiredCapabilities.every(
      (capability) =>
        this.identity.capabilities.includes(
          capability,
        ),
    );
  }

  async execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    if (
      !this.canHandle(
        request,
      )
    ) {
      return {
        success: false,
        failure: {
          requestId:
            request.id,
          providerId:
            this.identity.providerId,
          modelId:
            this.identity.modelId,
          retryable:
            false,
          code:
            "CAPABILITY_MISMATCH",
          message:
            "Test model cannot satisfy requested capabilities.",
          metadata: {
            requestId:
              request.id,
            startedAt:
              "2026-08-12T00:00:00.000Z",
            completedAt:
              "2026-08-12T00:00:00.001Z",
            latencyMs:
              1,
          },
        },
      };
    }

    return {
      success: true,
      response: {
        requestId:
          request.id,
        model:
          this.identity,
        content:
          "Provider adapter test response.",
        toolCallProposals: [],
        usage: {
          elapsedMs:
            1,
          tokensUsed:
            8,
          iterationsUsed:
            1,
          estimatedCost:
            0,
          inputTokens:
            5,
          outputTokens:
            3,
        },
        metadata: {
          requestId:
            request.id,
          startedAt:
            "2026-08-12T00:00:00.000Z",
          completedAt:
            "2026-08-12T00:00:00.001Z",
          latencyMs:
            1,
        },
      },
    };
  }
}

class TestProviderAdapter
  implements ProviderAdapter
{
  readonly descriptor:
    ProviderDescriptor = {
    id:
      "provider-test",
    name:
      "K.I.N.G.S. Test Provider",
    kind:
      "internal-local",
    available:
      true,
  };

  private readonly model =
    new TestModel();

  listModels() {
    return [
      this.model.identity,
    ];
  }

  getModel(
    modelId: ID,
  ) {
    if (
      modelId ===
      this.model.identity.modelId
    ) {
      return this.model;
    }

    return undefined;
  }

  execute(
    modelId: ID,
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    const model =
      this.getModel(
        modelId,
      );

    if (!model) {
      return Promise.resolve({
        success: false,
        failure: {
          requestId:
            request.id,
          providerId:
            this.descriptor.id,
          modelId,
          retryable:
            false,
          code:
            "MODEL_NOT_REGISTERED",
          message:
            `Model "${modelId}" is not registered with provider "${this.descriptor.id}".`,
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
      });
    }

    return model.execute(
      request,
    );
  }
}

async function runTest(): Promise<void> {
  const registry =
    new ProviderAdapterRegistry();

  const provider =
    new TestProviderAdapter();

  registry.register(
    provider,
  );

  assert(
    registry.get(
      "provider-test",
    ) === provider,
    "Registered provider could not be retrieved.",
  );

  console.log(
    "04.2 provider registration: SUCCESS",
  );

  assert(
    registry.list().length ===
      1,
    "Provider registry returned incorrect provider count.",
  );

  assert(
    registry.list()[0].id ===
      "provider-test",
    "Provider registry ordering or identity is incorrect.",
  );

  console.log(
    "04.2 deterministic provider registry: SUCCESS",
  );

  assert(
    registry.listAvailable().length ===
      1,
    "Available provider filtering failed.",
  );

  console.log(
    "04.2 provider availability discovery: SUCCESS",
  );

  assert(
    provider.listModels().length ===
      1,
    "Provider model discovery failed.",
  );

  assert(
    provider.getModel(
      "model-test",
    ) !== undefined,
    "Provider model lookup failed.",
  );

  console.log(
    "04.2 provider model discovery: SUCCESS",
  );

  const request:
    ModelExecutionRequest = {
    id:
      "provider-request-001",
    taskId:
      "task-provider-adapter",
    missionId:
      "mission-provider-adapter",
    messages: [
      {
        role:
          "user",
        content:
          "Execute provider adapter test.",
      },
    ],
    requiredCapabilities: [
      "coding",
    ],
    inputModalities: [
      "text",
    ],
    outputModality:
      "text",
    allowToolProposals:
      false,
  };

  const result =
    await registry.execute(
      "provider-test",
      "model-test",
      request,
    );

  assert(
    result.success,
    "Provider adapter execution failed.",
  );

  assert(
    result.response?.model.providerId ===
      "provider-test",
    "Provider identity was not preserved through adapter.",
  );

  assert(
    result.response?.model.modelId ===
      "model-test",
    "Model identity was not preserved through adapter.",
  );

  console.log(
    "04.2 provider-neutral execution delegation: SUCCESS",
  );

  const unknownProvider =
    await registry.execute(
      "provider-missing",
      "model-test",
      request,
    );

  assert(
    !unknownProvider.success,
    "Unknown provider must not execute.",
  );

  assert(
    unknownProvider.failure?.code ===
      "PROVIDER_NOT_REGISTERED",
    "Unknown provider failure was not preserved.",
  );

  console.log(
    "04.2 unknown provider rejection: SUCCESS",
  );

  const unknownModel =
    await registry.execute(
      "provider-test",
      "model-missing",
      request,
    );

  assert(
    !unknownModel.success,
    "Unknown model must not execute.",
  );

  assert(
    unknownModel.failure?.code ===
      "MODEL_NOT_REGISTERED",
    "Unknown model failure was not preserved.",
  );

  console.log(
    "04.2 unknown model rejection: SUCCESS",
  );

  class UnavailableProviderAdapter
    extends TestProviderAdapter {
    readonly descriptor:
      ProviderDescriptor = {
      id:
        "provider-test",
      name:
        "K.I.N.G.S. Unavailable Test Provider",
      kind:
        "internal-local",
      available:
        false,
    };
  }

  const unavailableProvider:
    ProviderAdapter =
    new UnavailableProviderAdapter();

  const unavailableRegistry =
    new ProviderAdapterRegistry();

  unavailableRegistry.register(
    unavailableProvider,
  );

  const unavailableResult =
    await unavailableRegistry.execute(
      "provider-test",
      "model-test",
      request,
    );

  assert(
    !unavailableResult.success,
    "Unavailable provider must not execute.",
  );

  assert(
    unavailableResult.failure?.code ===
      "PROVIDER_UNAVAILABLE",
    "Provider availability failure was not preserved.",
  );

  assert(
    unavailableResult.failure?.retryable ===
      true,
    "Provider unavailability should remain retryable.",
  );

  console.log(
    "04.2 unavailable provider rejection: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    registry.register(
      provider,
    );
  } catch {
    duplicateRejected =
      true;
  }

  assert(
    duplicateRejected,
    "Duplicate provider registration must be rejected.",
  );

  console.log(
    "04.2 duplicate provider rejection: SUCCESS",
  );

  assert(
    provider.descriptor.kind ===
      "internal-local",
    "Internal provider kind was not preserved.",
  );

  console.log(
    "04.2 internal provider adapter boundary: SUCCESS",
  );

  console.log(
    "TREE-04.2 PROVIDER ADAPTERS: SUCCESS",
  );
}

runTest().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
