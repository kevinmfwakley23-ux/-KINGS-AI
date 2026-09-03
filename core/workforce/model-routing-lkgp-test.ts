import type { ModelIdentity } from "./model-interface";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import { ModelRouter, type ModelRoutingMetrics } from "./model-routing";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function identity(modelId: string): ModelIdentity {
  return {
    providerId: `provider-${modelId}`,
    modelId,
    displayName: modelId,
    providerKind: "external-paid",
    capabilities: ["coding"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens: 64_000,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    available: true,
  };
}

const recent = identity("recent-known-good");
const stale = identity("stale-higher-score");
const registry = new ModelCapabilityRegistry();
registry.register({
  model: recent,
  capabilities: [{
    capability: "coding",
    strength: 90,
    status: "verified",
    evidenceReferences: ["recent-proof"],
  }],
});
registry.register({
  model: stale,
  capabilities: [{
    capability: "coding",
    strength: 99,
    status: "verified",
    evidenceReferences: ["stale-proof"],
  }],
});

const nowEpochMs = 10_000_000;
const metrics: ReadonlyMap<string, ModelRoutingMetrics> = new Map([
  [recent.modelId, {
    estimatedCost: 0.02,
    latencyMs: 600,
    reliability: 96,
    quotaRemainingRatio: 0.8,
    lastSuccessEpochMs: nowEpochMs - 1_000,
  }],
  [stale.modelId, {
    estimatedCost: 0.01,
    latencyMs: 400,
    reliability: 99,
    quotaRemainingRatio: 1,
    lastSuccessEpochMs: nowEpochMs - (2 * 60 * 60 * 1000),
  }],
]);

const decision = new ModelRouter(registry, metrics).route({
  requiredCapabilities: ["coding"],
  mode: "lkgp",
  nowEpochMs,
});

assert(decision.modelId === recent.modelId, "LKGP mode did not remain sticky to the recent successful model.");
assert((decision.candidates[0].scoreBreakdown?.freshness ?? 0) > (decision.candidates[1].scoreBreakdown?.freshness ?? 0), "Freshness was not represented in routing evidence.");

const unhealthy = new Map(metrics);
unhealthy.set(recent.modelId, {
  ...metrics.get(recent.modelId)!,
  providerHealthy: false,
});
const failover = new ModelRouter(registry, unhealthy).route({
  requiredCapabilities: ["coding"],
  mode: "lkgp",
  nowEpochMs,
});
assert(failover.modelId === stale.modelId, "LKGP stickiness overrode the hard health gate.");

console.log("Last-known-good stickiness: SUCCESS");
console.log("Hard health gate over stickiness: SUCCESS");
console.log("TREE-04 LKGP ROUTING: SUCCESS");
