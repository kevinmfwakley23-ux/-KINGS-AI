import type { ModelIdentity } from "./model-interface";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  ModelRouter,
  type ModelRoutingMetrics,
} from "./model-routing";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function verifiedCodingModel(
  providerId: string,
  modelId: string,
  contextWindowTokens: number,
): ModelIdentity {
  return {
    providerId,
    modelId,
    displayName: modelId,
    providerKind: providerId.includes("local")
      ? "internal-local"
      : "external-paid",
    capabilities: ["coding", "debugging"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    available: true,
  };
}

const registry = new ModelCapabilityRegistry();
const local = verifiedCodingModel(
  "provider-local",
  "model-local-32k",
  32_000,
);
const large = verifiedCodingModel(
  "provider-large",
  "model-large-128k",
  128_000,
);

for (const model of [local, large]) {
  registry.register({
    model,
    capabilities: [
      {
        capability: "coding",
        strength: model === local ? 92 : 96,
        status: "verified",
        evidenceReferences: ["context-routing-test"],
        verifiedAt: "2026-09-04T00:00:00.000Z",
      },
      {
        capability: "debugging",
        strength: model === local ? 90 : 95,
        status: "verified",
        evidenceReferences: ["context-routing-test"],
        verifiedAt: "2026-09-04T00:00:00.000Z",
      },
    ],
  });
}

const metrics: ReadonlyMap<string, ModelRoutingMetrics> = new Map([
  [
    "model-local-32k",
    {
      estimatedCost: 0,
      costBasis: "verified-free",
      latencyMs: 400,
      reliability: 95,
    },
  ],
  [
    "model-large-128k",
    {
      estimatedCost: 0.01,
      costBasis: "provider-reported",
      latencyMs: 700,
      reliability: 98,
    },
  ],
]);

const router = new ModelRouter(registry, metrics);

const smallRequest = router.route({
  requiredCapabilities: ["coding", "debugging"],
  requiredContextTokens: 24_000,
});
assert(
  smallRequest.modelId === "model-local-32k",
  "a smaller request should retain the lower-cost capable route",
);

const repositoryScaleRequest = router.route({
  requiredCapabilities: ["coding", "debugging"],
  requiredContextTokens: 64_000,
});
assert(
  repositoryScaleRequest.modelId === "model-large-128k",
  "repository-scale context must exclude models whose context window is too small",
);
assert(
  repositoryScaleRequest.candidates.every(
    (candidate) => candidate.contextWindowTokens >= 64_000,
  ),
  "every retained candidate must satisfy the requested context capacity",
);

const impossibleRequest = router.route({
  requiredCapabilities: ["coding", "debugging"],
  requiredContextTokens: 256_000,
});
assert(
  !impossibleRequest.selected && impossibleRequest.candidates.length === 0,
  "routing must fail closed when no model can fit the required context",
);

let rejectedInvalidContext = false;
try {
  router.route({
    requiredCapabilities: ["coding"],
    requiredContextTokens: 0,
  });
} catch (error) {
  rejectedInvalidContext =
    error instanceof Error && error.message.includes("positive integer");
}
assert(
  rejectedInvalidContext,
  "invalid context requirements must be rejected before routing",
);

assert(
  repositoryScaleRequest.reason.includes("context 128000 tokens"),
  "routing explanation should preserve selected context capacity evidence",
);

console.log("K.I.N.G.S. CONTEXT-WINDOW-AWARE MODEL ROUTING: SUCCESS");
