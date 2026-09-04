import { strict as assert } from "node:assert";
import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";
import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "./provider-adapters";
import { ProviderAdapterRegistry } from "./provider-adapters";
import type { ModelRoutingCandidate } from "./model-routing";
import { ResilientModelExecutionAuthority } from "./resilient-model-execution";

function request(): ModelExecutionRequest {
  return {
    id: "retired-route-request",
    taskId: "retired-route-task",
    missionId: "retired-route-mission",
    messages: [{ role: "user", content: "Build code." }],
    requiredCapabilities: ["coding"],
    inputModalities: ["text"],
    outputModality: "text",
    allowToolProposals: false,
  };
}

function modelIdentity(
  providerId: string,
  modelId: string,
  available: boolean,
): ModelIdentity {
  return {
    providerId,
    modelId,
    displayName: `${providerId}/${modelId}`,
    providerKind: "external-routed",
    capabilities: ["coding"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens: 128_000,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    available,
  };
}

class StaticModel implements IntelligenceModel {
  constructor(readonly identity: ModelIdentity) {}

  canHandle(): boolean {
    return true;
  }

  async execute(executionRequest: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const now = new Date(0).toISOString();
    return {
      success: true,
      response: {
        requestId: executionRequest.id,
        model: this.identity,
        content: "FILE: src/available.ts [create]\nexport const available = true;",
        toolCallProposals: [],
        usage: {
          elapsedMs: 1,
          tokensUsed: 4,
          iterationsUsed: 1,
          inputTokens: 2,
          outputTokens: 2,
        },
        metadata: {
          requestId: executionRequest.id,
          startedAt: now,
          completedAt: now,
          latencyMs: 1,
        },
      },
    };
  }
}

class CountingProvider implements ProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  readonly model: StaticModel;
  calls = 0;

  constructor(
    providerId: string,
    modelId: string,
    available: boolean,
  ) {
    this.descriptor = {
      id: providerId,
      name: providerId,
      kind: "external-routed",
      available: true,
    };
    this.model = new StaticModel(
      modelIdentity(providerId, modelId, available),
    );
  }

  listModels(): readonly ModelIdentity[] {
    return [this.model.identity];
  }

  getModel(modelId: string): IntelligenceModel | undefined {
    return modelId === this.model.identity.modelId ? this.model : undefined;
  }

  async execute(
    modelId: string,
    executionRequest: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    this.calls += 1;
    const model = this.getModel(modelId);
    if (!model) throw new Error("test model missing");
    return model.execute(executionRequest);
  }
}

function candidate(
  providerId: string,
  modelId: string,
  reliability: number,
): ModelRoutingCandidate {
  return {
    providerId,
    modelId,
    capabilityStrength: 80,
    estimatedCost: null,
    costBasis: "unknown",
    latencyMs: 500,
    reliability,
    internal: false,
  };
}

async function main(): Promise<void> {
  const registry = new ProviderAdapterRegistry();
  const retired = new CountingProvider(
    "omniroute",
    "retired/model",
    false,
  );
  const live = new CountingProvider(
    "9router",
    "live/model",
    true,
  );
  registry.register(retired);
  registry.register(live);

  const direct = await registry.execute(
    "omniroute",
    "retired/model",
    request(),
  );
  assert.equal(direct.success, false);
  assert.equal(direct.failure?.code, "MODEL_UNAVAILABLE");
  assert.equal(direct.failure?.retryable, true);
  assert.equal(
    retired.calls,
    0,
    "retired model must be rejected before provider/network execution",
  );

  const resilient = new ResilientModelExecutionAuthority(registry, {
    failureThreshold: 1,
    cooldownMs: 30_000,
    maximumAttempts: 4,
  });
  const outcome = await resilient.execute(
    [
      candidate("omniroute", "retired/model", 95),
      candidate("9router", "live/model", 90),
    ],
    request(),
  );

  assert.equal(outcome.result.success, true);
  assert.equal(outcome.providerId, "9router");
  assert.equal(outcome.modelId, "live/model");
  assert.equal(retired.calls, 0);
  assert.equal(live.calls, 1);
  assert.equal(outcome.attempts[0].failureCode, "MODEL_UNAVAILABLE");
  assert.equal(outcome.attempts[1].success, true);

  console.log("K.I.N.G.S. PROVIDER ROUTING → RETIRED MODEL FAIL-CLOSED: SUCCESS");
  console.log("K.I.N.G.S. PROVIDER ROUTING → NO NETWORK CALL TO RETIRED MODEL: SUCCESS");
  console.log("K.I.N.G.S. SUPERHOST → RETIRED MODEL FALLS THROUGH TO LIVE PROVIDER: SUCCESS");
  console.log("TREE-KCM-PROVIDER-MODEL-AVAILABILITY: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-PROVIDER-MODEL-AVAILABILITY: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
