import type { ModelIdentity } from "./model-interface";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import { ModelRouter, type ModelRoutingMetrics } from "./model-routing";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function model(
  providerId: string,
  modelId: string,
  providerKind: ModelIdentity["providerKind"],
  contextWindowTokens: number,
): ModelIdentity {
  return {
    providerId,
    modelId,
    displayName: modelId,
    providerKind,
    capabilities: ["coding", "reasoning"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    available: true,
  };
}

const internal = model("provider-local", "local-coder", "internal-local", 32_000);
const subscription = model("provider-subscription", "subscription-coder", "external-paid", 128_000);
const premium = model("provider-premium", "premium-coder", "external-paid", 128_000);
const fastFree = model("provider-free", "fast-free-coder", "external-free", 64_000);

const registry = new ModelCapabilityRegistry();
for (const [identity, strength] of [
  [internal, 88],
  [subscription, 93],
  [premium, 99],
  [fastFree, 82],
] as const) {
  registry.register({
    model: identity,
    capabilities: [
      {
        capability: "coding",
        strength,
        status: "verified",
        evidenceReferences: [`benchmark-${identity.modelId}`],
        verifiedAt: "2026-09-02T00:00:00.000Z",
      },
    ],
  });
}

const metrics: ReadonlyMap<string, ModelRoutingMetrics> = new Map([
  ["local-coder", {
    estimatedCost: 0,
    latencyMs: 900,
    reliability: 92,
    tokensPerSecond: 18,
    quotaRemainingRatio: 1,
  }],
  ["subscription-coder", {
    estimatedCost: 0.01,
    latencyMs: 700,
    reliability: 97,
    tokensPerSecond: 30,
    quotaRemainingRatio: 0.9,
    coveredBySubscription: true,
  }],
  ["premium-coder", {
    estimatedCost: 0.08,
    latencyMs: 450,
    reliability: 99,
    tokensPerSecond: 45,
    quotaRemainingRatio: 1,
  }],
  ["fast-free-coder", {
    estimatedCost: 0,
    latencyMs: 250,
    reliability: 87,
    tokensPerSecond: 60,
    quotaRemainingRatio: 0.8,
  }],
]);

const router = new ModelRouter(registry, metrics);

const legacy = router.route({ requiredCapabilities: ["coding"] });
assert(legacy.modelId === "local-coder", "Legacy routing behavior changed instead of remaining cost-first.");
assert(legacy.mode === "legacy", "Legacy mode must be explicit in routing evidence.");

const cheap = router.route({ requiredCapabilities: ["coding"], mode: "cheap" });
assert(cheap.modelId === "subscription-coder", "Cheap mode did not prioritize subscription-covered quota and quality.");
assert((cheap.candidates[0].routingScore ?? 0) > 0, "Adaptive candidate score was not preserved.");

const quotaFirst = router.route({ requiredCapabilities: ["coding"], mode: "quota-first" });
assert(quotaFirst.modelId === "subscription-coder", "Quota-first mode did not maximize covered model value.");

const fast = router.route({ requiredCapabilities: ["coding"], mode: "fast" });
assert(fast.modelId === "fast-free-coder", "Fast mode did not select the latency/throughput leader.");

const quality = router.route({
  requiredCapabilities: ["coding"],
  mode: "coding",
  minimumCapabilityStrength: 95,
});
assert(quality.modelId === "premium-coder", "Coding mode failed to respect a high capability threshold.");

const longContext = router.route({
  requiredCapabilities: ["coding"],
  mode: "balanced",
  requiredContextTokens: 64_000,
});
assert(!longContext.candidates.some((candidate) => candidate.modelId === "local-coder"), "Context-window gate admitted an undersized model.");

const offline = router.route({ requiredCapabilities: ["coding"], mode: "offline" });
assert(offline.modelId === "local-coder", "Offline routing did not stay on internal intelligence.");
assert(offline.candidates.every((candidate) => candidate.internal), "Offline routing exposed an external fallback.");

const noPaid = router.route({
  requiredCapabilities: ["coding"],
  mode: "balanced",
  allowPaidFallback: false,
});
assert(noPaid.candidates.every((candidate) => candidate.providerKind !== "external-paid"), "Paid providers survived an explicit no-paid boundary.");

const quotaGate = router.route({
  requiredCapabilities: ["coding"],
  mode: "balanced",
  minimumQuotaRemainingRatio: 0.95,
});
assert(!quotaGate.candidates.some((candidate) => candidate.modelId === "subscription-coder"), "Quota floor failed to reject a depleted candidate.");

const unhealthyMetrics = new Map(metrics);
unhealthyMetrics.set("subscription-coder", {
  ...metrics.get("subscription-coder")!,
  providerHealthy: false,
});
const healthRouter = new ModelRouter(registry, unhealthyMetrics);
const healthyOnly = healthRouter.route({ requiredCapabilities: ["coding"], mode: "cheap" });
assert(!healthyOnly.candidates.some((candidate) => candidate.modelId === "subscription-coder"), "Circuit health gate admitted an unhealthy candidate.");

const bounded = router.route({
  requiredCapabilities: ["coding"],
  mode: "balanced",
  fallbackLimit: 2,
});
assert(bounded.fallbackChain?.length === 2, "Fallback chain did not honor its governed bound.");

const baselineAuto = router.route({
  requiredCapabilities: ["coding"],
  mode: "auto",
  routingKey: "mission-route-stability",
  explorationRate: 0,
});
const exploredA = router.route({
  requiredCapabilities: ["coding"],
  mode: "auto",
  routingKey: "mission-route-stability",
  explorationRate: 1,
});
const exploredB = router.route({
  requiredCapabilities: ["coding"],
  mode: "auto",
  routingKey: "mission-route-stability",
  explorationRate: 1,
});
assert(exploredA.explored === true, "Bounded exploration was not recorded.");
assert(exploredA.modelId !== baselineAuto.modelId, "Exploration did not test the second-ranked governed candidate.");
assert(exploredA.modelId === exploredB.modelId, "Exploration must be deterministic for the same routing key.");

console.log("Legacy routing compatibility: SUCCESS");
console.log("Subscription/quota economics: SUCCESS");
console.log("Task-aware quality and speed modes: SUCCESS");
console.log("Context/paid/offline/health hard gates: SUCCESS");
console.log("Bounded fallback and deterministic exploration: SUCCESS");
console.log("TREE-04 ADAPTIVE MODEL ROUTING: SUCCESS");
