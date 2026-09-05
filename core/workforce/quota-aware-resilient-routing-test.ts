import { strict as assert } from "node:assert";
import type { IntelligenceModel, ModelExecutionRequest, ModelExecutionResult, ModelIdentity } from "./model-interface";
import type { ModelRoutingCandidate } from "./model-routing";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { ResilientModelExecutionAuthority } from "./resilient-model-execution";

class StubProviderModel implements IntelligenceModel {
  readonly identity: ModelIdentity;
  calls = 0;
  constructor(
    providerId: string,
    modelId: string,
    private readonly resultFactory: (request: ModelExecutionRequest) => ModelExecutionResult,
  ) {
    this.identity = {
      providerId,
      modelId,
      displayName: `${providerId}/${modelId}`,
      providerKind: "external-routed",
      capabilities: ["coding"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindowTokens: 128_000,
      supportsToolCalling: false,
      supportsStructuredOutput: false,
      available: true,
    };
  }
  canHandle(): boolean { return true; }
  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    this.calls += 1;
    return this.resultFactory(request);
  }
}

function failure(request: ModelExecutionRequest, providerId: string, modelId: string): ModelExecutionResult {
  return {
    success: false,
    failure: {
      requestId: request.id,
      providerId,
      modelId,
      retryable: true,
      code: "GATEWAY_HTTP_429",
      message: "Free tier quota exhausted; rate limit exceeded.",
      metadata: {
        requestId: request.id,
        startedAt: "2026-09-04T00:00:00.000Z",
        completedAt: "2026-09-04T00:00:00.001Z",
        latencyMs: 1,
      },
    },
  };
}

function success(request: ModelExecutionRequest, model: ModelIdentity): ModelExecutionResult {
  return {
    success: true,
    response: {
      requestId: request.id,
      model,
      content: "ok",
      toolCallProposals: [],
      usage: {
        elapsedMs: 1,
        tokensUsed: 20,
        iterationsUsed: 1,
        inputTokens: 10,
        outputTokens: 10,
      },
      metadata: {
        requestId: request.id,
        startedAt: "2026-09-04T00:00:00.000Z",
        completedAt: "2026-09-04T00:00:00.001Z",
        latencyMs: 1,
      },
    },
  };
}

const request: ModelExecutionRequest = {
  id: "quota-request",
  taskId: "task",
  missionId: "mission",
  messages: [{ role: "user", content: "code" }],
  requiredCapabilities: ["coding"],
  inputModalities: ["text"],
  outputModality: "text",
  allowToolProposals: false,
};

function candidate(providerId: string, modelId: string): ModelRoutingCandidate {
  return {
    providerId,
    modelId,
    capabilityStrength: 90,
    estimatedCost: 0,
    costBasis: "verified-free",
    latencyMs: 10,
    reliability: 90,
    contextWindowTokens: 128_000,
    internal: false,
    zeroMarginalCost: true,
  };
}

async function main(): Promise<void> {
  let now = Date.parse("2026-09-04T18:00:00.000Z");
  const providers = new ProviderAdapterRegistry();
  const exhaustedA = new StubProviderModel("free-provider", "model-a", (r) => failure(r, "free-provider", "model-a"));
  const exhaustedB = new StubProviderModel("free-provider", "model-b", (r) => failure(r, "free-provider", "model-b"));
  let fallback: StubProviderModel;
  fallback = new StubProviderModel("fallback-provider", "model-c", (r) => success(r, fallback.identity));
  providers.register({
    descriptor: {
      id: "free-provider",
      name: "Free Provider",
      kind: "external-routed",
      available: true,
    },
    listModels: () => [exhaustedA.identity, exhaustedB.identity],
    getModel: (modelId: string) => modelId === "model-a" ? exhaustedA : modelId === "model-b" ? exhaustedB : undefined,
    execute: async (modelId: string, r: ModelExecutionRequest) => {
      const model = modelId === "model-a" ? exhaustedA : exhaustedB;
      return model.execute(r);
    },
  });
  providers.register({
    descriptor: {
      id: "fallback-provider",
      name: "Fallback Provider",
      kind: "external-routed",
      available: true,
    },
    listModels: () => [fallback.identity],
    getModel: (modelId: string) => modelId === "model-c" ? fallback : undefined,
    execute: async (_modelId: string, r: ModelExecutionRequest) => fallback.execute(r),
  });

  const resilient = new ResilientModelExecutionAuthority(providers, {
    failureThreshold: 3,
    cooldownMs: 1_000,
    quotaCooldownMs: 60_000,
    now: () => now,
  });
  const routes = [
    candidate("free-provider", "model-a"),
    candidate("free-provider", "model-b"),
    candidate("fallback-provider", "model-c"),
  ];

  const first = await resilient.execute(routes, request);
  assert.equal(first.result.success, true, "fallback provider did not recover the request");
  assert.equal(exhaustedA.calls, 1, "first free route should be attempted once");
  assert.equal(exhaustedB.calls, 0, "provider-wide quota exhaustion should skip sibling models immediately");
  assert.equal(fallback.calls, 1, "fallback should execute after quota exhaustion");
  assert(
    first.attempts.some((attempt) => attempt.failureCode === "PROVIDER_QUOTA_COOLDOWN" && attempt.modelId === "model-b"),
    "sibling route was not visibly skipped under provider quota cooldown",
  );
  assert.equal(resilient.getProviderCooldownUntil("free-provider"), now + 60_000);

  const second = await resilient.execute(routes, { ...request, id: "quota-request-2" });
  assert.equal(second.result.success, true);
  assert.equal(exhaustedA.calls, 1, "provider should not be retried while quota cooldown is active");
  assert.equal(exhaustedB.calls, 0);
  assert.equal(fallback.calls, 2);

  now += 60_001;
  await resilient.execute(routes, { ...request, id: "quota-request-3" });
  assert.equal(exhaustedA.calls, 2, "provider should become eligible after cooldown expires");

  console.log("QUOTA-ROUTING-001 HTTP 429/free-quota exhaustion triggers provider-wide cooldown: SUCCESS");
  console.log("QUOTA-ROUTING-002 sibling provider models are skipped instead of thrashed: SUCCESS");
  console.log("QUOTA-ROUTING-003 fallback executes immediately and provider re-enters after cooldown: SUCCESS");
  console.log("K.I.N.G.S. QUOTA-AWARE RESILIENT ROUTING: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
