import { ModelRoutingRuntimeTelemetry } from "./model-routing-runtime";
import type { ModelRoutingMetrics } from "./model-routing";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const telemetry = new ModelRoutingRuntimeTelemetry({
  ewmaAlpha: 0.5,
  failureThreshold: 2,
  baseCooldownMs: 5_000,
  maximumCooldownMs: 20_000,
});

const base: ReadonlyMap<string, ModelRoutingMetrics> = new Map([
  ["model-a", {
    estimatedCost: 0.01,
    latencyMs: 500,
    reliability: 98,
    tokensPerSecond: 30,
    quotaRemainingRatio: 1,
    providerHealthy: true,
  }],
]);

telemetry.record({
  modelId: "model-a",
  providerId: "provider-a",
  success: false,
  retryable: true,
  latencyMs: 800,
  timestampEpochMs: 1_000,
});
telemetry.record({
  modelId: "model-a",
  providerId: "provider-a",
  success: false,
  retryable: true,
  latencyMs: 900,
  timestampEpochMs: 2_000,
});

const failed = telemetry.get("model-a");
assert(failed?.recentFailureCount === 2, "Retryable failure streak was not retained.");
assert(failed?.cooldownUntilEpochMs === 7_000, "Circuit cooldown was not opened at the configured threshold.");

const duringCooldown = telemetry.mergeMetrics(base, 3_000).get("model-a");
assert(duringCooldown?.providerHealthy === false, "Active circuit cooldown did not remove model health.");
assert((duringCooldown?.reliability ?? 100) < 98, "Failure observations did not lower runtime reliability.");

const afterCooldown = telemetry.mergeMetrics(base, 8_000).get("model-a");
assert(afterCooldown?.providerHealthy === true, "Expired cooldown did not permit a half-open retry.");

telemetry.updateQuota("model-a", "provider-a", 0.4);
assert(telemetry.get("model-a")?.quotaRemainingRatio === 0.4, "Quota telemetry was not retained.");

telemetry.record({
  modelId: "model-a",
  providerId: "provider-a",
  success: true,
  retryable: false,
  latencyMs: 400,
  timestampEpochMs: 9_000,
  tokensPerSecond: 40,
  quotaRemainingRatio: 0.35,
});

const recovered = telemetry.get("model-a");
assert(recovered?.recentFailureCount === 0, "Successful execution did not reset the failure streak.");
assert(recovered?.cooldownUntilEpochMs === undefined, "Successful execution did not close the circuit.");
assert(recovered?.lastSuccessEpochMs === 9_000, "Last-known-good timestamp was not recorded.");
assert(recovered?.quotaRemainingRatio === 0.35, "Fresh quota observation did not replace stale quota.");
assert((recovered?.tokensPerSecond ?? 0) > 0, "Throughput telemetry was not learned.");

console.log("Retryable failure circuit opening: SUCCESS");
console.log("Cooldown half-open recovery: SUCCESS");
console.log("Quota and throughput telemetry: SUCCESS");
console.log("Last-known-good recovery: SUCCESS");
console.log("TREE-04 ROUTING RUNTIME TELEMETRY: SUCCESS");
