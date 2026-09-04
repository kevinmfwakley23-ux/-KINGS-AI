import { strict as assert } from "node:assert";
import type { ModelIdentity } from "./model-interface";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";

function model(
  providerId: string,
  modelId: string,
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
    available: true,
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
      strength: 85,
      status: "unverified",
      evidenceReferences: [`${identity.providerId}:live-catalog`],
    }],
  });
}

function routeBase() {
  return {
    requiredCapabilities: ["coding" as const],
    preferExternal: true,
    allowUnverifiedUnderPostExecutionVerification: true,
  };
}

function main(): void {
  const registry = new ModelCapabilityRegistry();
  const fastUnreliable = model("fast", "coder-fast");
  const balanced = model("balanced", "coder-balanced");
  const slowReliable = model("slow", "coder-reliable");
  for (const identity of [fastUnreliable, balanced, slowReliable]) {
    register(registry, identity);
  }

  const metrics = new Map<string, ModelRoutingMetrics>([
    [
      modelRoutingMetricKey("fast", "coder-fast"),
      {
        estimatedCost: 0.002,
        costBasis: "provider-reported",
        latencyMs: 180,
        reliability: 72,
      },
    ],
    [
      modelRoutingMetricKey("balanced", "coder-balanced"),
      {
        estimatedCost: 0.004,
        costBasis: "provider-reported",
        latencyMs: 420,
        reliability: 94,
      },
    ],
    [
      modelRoutingMetricKey("slow", "coder-reliable"),
      {
        estimatedCost: 0.003,
        costBasis: "provider-reported",
        latencyMs: 1_800,
        reliability: 99,
      },
    ],
  ]);
  const router = new ModelRouter(registry, metrics);

  const unrestricted = router.route(routeBase());
  assert.equal(
    unrestricted.providerId,
    "fast",
    "ordinary routing should still prefer the lower known cost before policy constraints",
  );

  const reliable = router.route({
    ...routeBase(),
    minimumReliability: 90,
  });
  assert.deepEqual(
    reliable.candidates.map((candidate) => candidate.providerId),
    ["slow", "balanced"],
    "reliability policy must exclude routes below the mission threshold",
  );
  assert.equal(reliable.providerId, "slow");

  const responsiveAndReliable = router.route({
    ...routeBase(),
    minimumReliability: 90,
    maximumLatencyMs: 600,
  });
  assert.equal(responsiveAndReliable.providerId, "balanced");
  assert.deepEqual(
    responsiveAndReliable.candidates.map((candidate) => candidate.providerId),
    ["balanced"],
  );

  const allowListed = router.route({
    ...routeBase(),
    allowedProviderIds: ["balanced", "slow"],
  });
  assert.equal(allowListed.candidates.some((candidate) => candidate.providerId === "fast"), false);

  const denied = router.route({
    ...routeBase(),
    deniedProviderIds: ["fast", "slow"],
  });
  assert.equal(denied.providerId, "balanced");

  const explicitDenied = router.route({
    requiredCapabilities: ["coding"],
    preferredProviderId: "fast",
    preferredModelId: "coder-fast",
    allowUnverifiedExplicitSelection: true,
    deniedProviderIds: ["fast"],
  });
  assert.equal(
    explicitDenied.selected,
    false,
    "provider deny policy must remain authoritative even for explicit route selection",
  );

  assert.throws(
    () => router.route({ ...routeBase(), minimumReliability: 101 }),
    /minimum reliability must be between 0 and 100/,
  );
  assert.throws(
    () => router.route({ ...routeBase(), maximumLatencyMs: Number.NaN }),
    /maximum latency must be a finite non-negative number/,
  );
  assert.throws(
    () => router.route({
      ...routeBase(),
      allowedProviderIds: ["balanced"],
      deniedProviderIds: ["balanced"],
    }),
    /cannot be both allowed and denied/,
  );
  assert.throws(
    () => router.route({
      ...routeBase(),
      deniedProviderIds: ["fast", "fast"],
    }),
    /duplicate provider id/,
  );

  console.log("K.I.N.G.S. ROUTING POLICY → MINIMUM RELIABILITY: SUCCESS");
  console.log("K.I.N.G.S. ROUTING POLICY → MAXIMUM LATENCY: SUCCESS");
  console.log("K.I.N.G.S. ROUTING POLICY → PROVIDER ALLOW/DENY: SUCCESS");
  console.log("K.I.N.G.S. ROUTING POLICY → EXPLICIT ROUTE STILL GOVERNED: SUCCESS");
  console.log("TREE-KCM-SUPERHOST-ROUTING-POLICY: SUCCESS");
}

try {
  main();
} catch (error) {
  console.error("TREE-KCM-SUPERHOST-ROUTING-POLICY: FAILURE");
  console.error(error);
  process.exitCode = 1;
}
