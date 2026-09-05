import { strict as assert } from "node:assert";
import type {
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";
import { AdaptiveModelRoutingAuthority } from "./adaptive-model-routing";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";

function model(providerId: string, modelId: string): ModelIdentity {
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
    available: true,
  };
}

function result(input: {
  model: ModelIdentity;
  success: boolean;
  latencyMs: number;
  costUsd?: number;
}): ModelExecutionResult {
  const now = new Date(0).toISOString();
  if (!input.success) {
    return {
      success: false,
      failure: {
        requestId: "adaptive-request",
        providerId: input.model.providerId,
        modelId: input.model.modelId,
        retryable: true,
        code: "GATEWAY_HTTP_503",
        message: "gateway unavailable",
        metadata: {
          requestId: "adaptive-request",
          startedAt: now,
          completedAt: now,
          latencyMs: input.latencyMs,
        },
      },
    };
  }

  return {
    success: true,
    response: {
      requestId: "adaptive-request",
      model: input.model,
      content: "ok",
      toolCallProposals: [],
      usage: {
        elapsedMs: input.latencyMs,
        tokensUsed: 20,
        iterationsUsed: 1,
        inputTokens: 10,
        outputTokens: 10,
        reportedCostUsd: input.costUsd,
      },
      metadata: {
        requestId: "adaptive-request",
        startedAt: now,
        completedAt: now,
        latencyMs: input.latencyMs,
      },
    },
  };
}

function register(
  registry: ModelCapabilityRegistry,
  identity: ModelIdentity,
): void {
  registry.register({
    model: identity,
    capabilities: [{
      capability: "coding",
      strength: 80,
      status: "unverified",
      evidenceReferences: [`${identity.providerId}:live-catalog`],
    }],
  });
}

function main(): void {
  const omni = model("omniroute", "auto/coding");
  const nine = model("9router", "provider/coder");
  const registry = new ModelCapabilityRegistry();
  register(registry, omni);
  register(registry, nine);

  const metrics = new Map<string, ModelRoutingMetrics>([
    [
      modelRoutingMetricKey("omniroute", "auto/coding"),
      { costBasis: "unknown", latencyMs: 600, reliability: 95 },
    ],
    [
      modelRoutingMetricKey("9router", "provider/coder"),
      { costBasis: "unknown", latencyMs: 700, reliability: 90 },
    ],
  ]);
  const router = new ModelRouter(registry, metrics);
  const learning = new AdaptiveModelRoutingAuthority(metrics, {
    learningRate: 0.5,
  });

  const before = router.route({
    requiredCapabilities: ["coding"],
    preferExternal: true,
    allowUnverifiedUnderPostExecutionVerification: true,
  });
  assert.equal(before.providerId, "omniroute");

  learning.observe(
    "omniroute",
    "auto/coding",
    result({ model: omni, success: false, latencyMs: 1_500 }),
  );
  learning.observe(
    "9router",
    "provider/coder",
    result({ model: nine, success: true, latencyMs: 350, costUsd: 0.012 }),
  );

  const omniMetric = learning.snapshot("omniroute", "auto/coding");
  const nineMetric = learning.snapshot("9router", "provider/coder");
  assert.equal(omniMetric?.reliability, 48);
  assert.equal(omniMetric?.latencyMs, 1_050);
  assert.equal(nineMetric?.reliability, 95);
  assert.equal(nineMetric?.latencyMs, 525);
  assert.equal(nineMetric?.estimatedCost, 0.012);
  assert.equal(nineMetric?.costBasis, "provider-reported");

  const after = router.route({
    requiredCapabilities: ["coding"],
    preferExternal: true,
    allowUnverifiedUnderPostExecutionVerification: true,
  });
  assert.equal(
    after.providerId,
    "9router",
    "real execution evidence must be able to change future route ordering",
  );

  learning.observe(
    "9router",
    "provider/coder",
    result({ model: nine, success: true, latencyMs: 0 }),
  );
  assert.equal(
    learning.snapshot("9router", "provider/coder")?.latencyMs,
    525,
    "zero-duration synthetic/fail-fast timings must not corrupt latency learning",
  );

  console.log("K.I.N.G.S. ADAPTIVE ROUTING → FAILURE LOWERS RELIABILITY: SUCCESS");
  console.log("K.I.N.G.S. ADAPTIVE ROUTING → SUCCESS LEARNS LATENCY: SUCCESS");
  console.log("K.I.N.G.S. ADAPTIVE ROUTING → PROVIDER COST EVIDENCE: SUCCESS");
  console.log("K.I.N.G.S. ADAPTIVE ROUTING → FUTURE MODEL ORDER CHANGES: SUCCESS");
  console.log("TREE-KCM-ADAPTIVE-MODEL-ROUTING: SUCCESS");
}

try {
  main();
} catch (error) {
  console.error("TREE-KCM-ADAPTIVE-MODEL-ROUTING: FAILURE");
  console.error(error);
  process.exitCode = 1;
}
