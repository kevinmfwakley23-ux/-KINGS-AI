import { strict as assert } from "node:assert";
import type { ModelIdentity } from "./model-interface";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";

function identity(
  providerId: string,
  modelId: string,
  providerKind: ModelIdentity["providerKind"],
  strength: number,
): { model: ModelIdentity; strength: number } {
  return {
    model: {
      providerId,
      modelId,
      displayName: `${providerId}/${modelId}`,
      providerKind,
      capabilities: ["coding"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindowTokens: 128_000,
      supportsToolCalling: true,
      supportsStructuredOutput: true,
      available: true,
    },
    strength,
  };
}

function register(
  registry: ModelCapabilityRegistry,
  entry: ReturnType<typeof identity>,
): void {
  registry.register({
    model: entry.model,
    capabilities: [{
      capability: "coding",
      strength: entry.strength,
      status: "verified",
      evidenceReferences: [`${entry.model.providerId}:economy-test`],
      verifiedAt: new Date(0).toISOString(),
    }],
  });
}

function main(): void {
  const registry = new ModelCapabilityRegistry();
  const local = identity("local", "qwen-local", "internal-local", 72);
  const freeCloud = identity("free-cloud", "coder-free", "external-routed", 82);
  const cheap = identity("cheap-cloud", "coder-cheap", "external-paid", 55);
  const premium = identity("premium-cloud", "coder-premium", "external-paid", 99);

  [local, freeCloud, cheap, premium].forEach((entry) => register(registry, entry));

  const metrics = new Map<string, ModelRoutingMetrics>([
    [modelRoutingMetricKey("local", "qwen-local"), {
      estimatedCost: 0,
      costBasis: "verified-free",
      latencyMs: 900,
      reliability: 75,
    }],
    [modelRoutingMetricKey("free-cloud", "coder-free"), {
      estimatedCost: 0,
      costBasis: "verified-free",
      latencyMs: 500,
      reliability: 88,
    }],
    [modelRoutingMetricKey("cheap-cloud", "coder-cheap"), {
      estimatedCost: 0.0001,
      costBasis: "provider-reported",
      latencyMs: 350,
      reliability: 80,
    }],
    [modelRoutingMetricKey("premium-cloud", "coder-premium"), {
      estimatedCost: 0.03,
      costBasis: "provider-reported",
      latencyMs: 300,
      reliability: 99,
    }],
  ]);

  const router = new ModelRouter(registry, metrics);

  const economy = router.route({
    requiredCapabilities: ["coding"],
    preferExternal: true,
    costPreference: "economy",
  });
  assert.equal(
    economy.providerId,
    "free-cloud",
    "economy routing should stay at zero token cost even when external routing is preferred",
  );
  assert.equal(economy.candidates[0]?.zeroMarginalCost, true);

  const freeOnly = router.route({
    requiredCapabilities: ["coding"],
    costPreference: "free-only",
  });
  assert.deepEqual(
    freeOnly.candidates.map((candidate) => candidate.providerId),
    ["free-cloud", "local"],
    "free-only must exclude every metered route",
  );

  const localOnly = router.route({
    requiredCapabilities: ["coding"],
    costPreference: "local-only",
  });
  assert.equal(localOnly.providerId, "local");
  assert.equal(localOnly.candidates.length, 1);

  const quality = router.route({
    requiredCapabilities: ["coding"],
    costPreference: "quality",
  });
  assert.equal(
    quality.providerId,
    "premium-cloud",
    "quality mode must remain an owner-controlled escalation path",
  );

  const automaticFloor = router.route({
    requiredCapabilities: ["coding"],
    minimumCapabilityStrength: 70,
    costPreference: "economy",
  });
  assert.equal(
    automaticFloor.candidates.some((candidate) => candidate.providerId === "cheap-cloud"),
    false,
    "automatic routing must still respect its configured quality floor",
  );

  const explicitCheap = router.route({
    requiredCapabilities: ["coding"],
    minimumCapabilityStrength: 70,
    preferredProviderId: "cheap-cloud",
    preferredModelId: "coder-cheap",
    allowUnverifiedExplicitSelection: true,
    costPreference: "economy",
  });
  assert.equal(
    explicitCheap.providerId,
    "cheap-cloud",
    "owner-selected affordable model must remain usable below an automatic capability floor",
  );
  assert.equal(explicitCheap.candidates[0]?.capabilityStrength, 55);

  console.log("K.I.N.G.S. ECONOMY ROUTING → ZERO-COST FIRST: SUCCESS");
  console.log("K.I.N.G.S. ECONOMY ROUTING → FREE-ONLY: SUCCESS");
  console.log("K.I.N.G.S. ECONOMY ROUTING → LOCAL-ONLY: SUCCESS");
  console.log("K.I.N.G.S. ECONOMY ROUTING → OWNER QUALITY ESCALATION: SUCCESS");
  console.log("K.I.N.G.S. ECONOMY ROUTING → OWNER WEAKER MODEL CHOICE: SUCCESS");
  console.log("TREE-KCM-MODEL-ROUTING-ECONOMY: SUCCESS");
}

try {
  main();
} catch (error) {
  console.error("TREE-KCM-MODEL-ROUTING-ECONOMY: FAILURE");
  console.error(error);
  process.exitCode = 1;
}
