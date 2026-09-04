import type { ModelIdentity } from "./model-interface";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const verifiedLocal: ModelIdentity = {
  providerId: "local",
  modelId: "local-coder",
  displayName: "Local Coder",
  providerKind: "internal-local",
  capabilities: ["coding"],
  inputModalities: ["text"],
  outputModalities: ["text"],
  contextWindowTokens: 32_000,
  supportsToolCalling: false,
  supportsStructuredOutput: false,
  available: true,
};

const liveGateway: ModelIdentity = {
  providerId: "omniroute",
  modelId: "auto/coding",
  displayName: "OmniRoute auto/coding",
  providerKind: "external-routed",
  capabilities: ["coding"],
  inputModalities: ["text"],
  outputModalities: ["text"],
  contextWindowTokens: 128_000,
  supportsToolCalling: false,
  supportsStructuredOutput: false,
  available: true,
};

const registry = new ModelCapabilityRegistry();
registry.register({
  model: verifiedLocal,
  capabilities: [{
    capability: "coding",
    strength: 90,
    status: "verified",
    evidenceReferences: ["executed-local-acceptance"],
    verifiedAt: "2026-09-04T00:00:00.000Z",
  }],
});
registry.register({
  model: liveGateway,
  capabilities: [{
    capability: "coding",
    strength: 80,
    status: "unverified",
    evidenceReferences: ["omniroute:live-v1-models-catalog"],
  }],
});

const metrics = new Map<string, ModelRoutingMetrics>([
  [
    modelRoutingMetricKey("local", "local-coder"),
    {
      estimatedCost: 0,
      costBasis: "configured-estimate",
      latencyMs: 900,
      reliability: 90,
    },
  ],
  [
    modelRoutingMetricKey("omniroute", "auto/coding"),
    {
      costBasis: "unknown",
      latencyMs: 700,
      reliability: 85,
    },
  ],
]);

const router = new ModelRouter(registry, metrics);

const verifiedOnly = router.route({
  requiredCapabilities: ["coding"],
  preferExternal: true,
});
assert(
  verifiedOnly.providerId === "local",
  "Unverified gateway must not enter ordinary verified-only routing.",
);

const governed = router.route({
  requiredCapabilities: ["coding"],
  preferExternal: true,
  allowUnverifiedUnderPostExecutionVerification: true,
});
assert(governed.selected, "Governed post-verification route was not selected.");
assert(
  governed.providerId === "omniroute" && governed.modelId === "auto/coding",
  "Gateway-first routing did not prefer the live external route under independent verification.",
);
assert(
  governed.reason.includes("independent post-execution verification"),
  "Routing explanation does not disclose the post-execution verification boundary.",
);

const costBound = router.route({
  requiredCapabilities: ["coding"],
  preferExternal: true,
  allowUnverifiedUnderPostExecutionVerification: true,
  maximumEstimatedCost: 0,
});
assert(
  costBound.providerId === "local",
  "Unknown gateway pricing must not bypass an automatic $0 cost ceiling.",
);

console.log("K.I.N.G.S. ROUTING → VERIFIED-ONLY DEFAULT: SUCCESS");
console.log("K.I.N.G.S. ROUTING → UNVERIFIED UNDER REAL POST-VERIFICATION: SUCCESS");
console.log("K.I.N.G.S. ROUTING → UNKNOWN COST DOES NOT BYPASS CEILING: SUCCESS");
console.log("TREE-KCM-MODEL-ROUTING-POST-VERIFICATION: SUCCESS");
