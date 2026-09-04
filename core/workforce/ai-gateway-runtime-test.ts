import {
  configuredGatewayDefinitions,
  loadKingsAiGatewayRuntime,
  registerKingsAiGatewayRuntime,
  selectKingsAiGatewayCodingRoute,
} from "./ai-gateway-runtime";
import type {
  OpenAiCompatibleGatewayConfig,
  OpenAiCompatibleGatewayTransport,
} from "./openai-compatible-gateway";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

class CatalogTransport implements OpenAiCompatibleGatewayTransport {
  constructor(private readonly providerId: string) {}

  async request(method: "GET" | "POST", path: string) {
    if (method === "GET" && path === "/models") {
      const models = this.providerId === "omniroute"
        ? [
            "auto/coding",
            "auto",
            "openai/gpt-coder",
            "anthropic/claude-sonnet",
            "image/flux-pro",
          ]
        : this.providerId === "openrouter"
          ? [
              "openrouter/free",
              "qwen/qwen-coder:free",
              "paid/frontier-coder",
              "image/flux-pro",
            ]
          : [
              "cx/gpt-codex",
              "kr/qwen3-coder-next",
              "gh/claude-sonnet",
              "audio/tts-1",
            ];
      return {
        status: 200,
        text: "",
        body: { data: models.map((id) => ({ id })) },
      };
    }

    return {
      status: 200,
      text: "",
      body: {
        id: "completion-1",
        choices: [{ message: { content: "FILE: src/a.ts [create]\nexport{};" } }],
        usage: { total_tokens: 5 },
      },
    };
  }
}

async function runTest(): Promise<void> {
  const env = {
    KINGS_OMNIROUTE_URL: "http://127.0.0.1:20128",
    KINGS_OMNIROUTE_KEY: "test-omni",
    KINGS_9ROUTER_URL: "http://127.0.0.1:30128",
    KINGS_9ROUTER_KEY: "test-nine",
    KINGS_9ROUTER_MODELS: "stale/configured-coder",
    KINGS_OPENROUTER_KEY: "test-openrouter",
    KINGS_GROQ_KEY: "test-groq",
    KINGS_CEREBRAS_KEY: "test-cerebras",
    KINGS_MISTRAL_KEY: "test-mistral",
    KINGS_CHUTES_KEY: "test-chutes",
    KINGS_TOGETHER_KEY: "test-together",
    KINGS_FIREWORKS_KEY: "test-fireworks",
  } as NodeJS.ProcessEnv;

  const definitions = configuredGatewayDefinitions(env);
  assert(
    definitions.length === 9,
    "OmniRoute, 9Router, and seven direct provider pools must all configure.",
  );
  for (const providerId of [
    "omniroute",
    "9router",
    "openrouter",
    "groq",
    "cerebras",
    "mistral",
    "chutes",
    "together",
    "fireworks",
  ]) {
    assert(
      definitions.some((item) => item.id === providerId),
      `Direct/provider definition missing: ${providerId}`,
    );
  }
  const openRouterDefinition = definitions.find((item) => item.id === "openrouter");
  assert(
    openRouterDefinition?.gatewayKind === "openrouter" &&
    openRouterDefinition.models?.some((model) => model.modelId === "openrouter/free"),
    "OpenRouter must seed its documented free router as a first-class K.I.N.G.S. route.",
  );
  console.log("GATEWAY-RUNTIME-001 OmniRoute + 9Router + direct economy-provider config: SUCCESS");

  const runtime = await loadKingsAiGatewayRuntime({
    env,
    transportFactory(config: OpenAiCompatibleGatewayConfig) {
      return new CatalogTransport(config.id);
    },
  });

  assert(runtime.gateways.length === 9, "Gateway runtime did not load all configured provider pools.");
  assert(
    runtime.catalog.some(
      (entry) =>
        entry.providerId === "omniroute" &&
        entry.modelId === "openai/gpt-coder",
    ),
    "Live OmniRoute model catalog was not imported.",
  );
  assert(
    runtime.catalog.some(
      (entry) =>
        entry.providerId === "9router" &&
        entry.modelId === "kr/qwen3-coder-next",
    ),
    "Live 9Router model catalog was not imported.",
  );
  assert(
    runtime.catalog.some(
      (entry) =>
        entry.providerId === "groq" &&
        entry.modelId === "kr/qwen3-coder-next",
    ),
    "Direct OpenAI-compatible provider discovery did not feed the common catalog.",
  );
  assert(
    !runtime.catalog.some((entry) => entry.modelId === "image/flux-pro"),
    "Image-only models must not enter the coding execution catalog.",
  );
  assert(
    !runtime.catalog.some((entry) => entry.modelId === "audio/tts-1"),
    "Audio-only models must not enter the coding execution catalog.",
  );
  const staleRoute = runtime.catalog.find(
    (entry) =>
      entry.providerId === "9router" &&
      entry.modelId === "stale/configured-coder",
  );
  assert(
    staleRoute?.codingEligible === false,
    "A configured 9Router model missing from live discovery must not be coding-eligible.",
  );
  console.log("GATEWAY-RUNTIME-002 live /v1/models discovery + coding filter: SUCCESS");

  const documentedAutoRoute = runtime.catalog.find(
    (entry) => entry.providerId === "omniroute" && entry.modelId === "auto/coding",
  );
  assert(
    documentedAutoRoute?.documentedCodingRoute === true,
    "OmniRoute auto/coding should retain its documented-route evidence.",
  );
  assert(
    documentedAutoRoute?.verifiedCodingRoute === false,
    "Documentation must not be promoted to executed coding verification.",
  );

  const documentedFreeRoute = runtime.catalog.find(
    (entry) => entry.providerId === "openrouter" && entry.modelId === "openrouter/free",
  );
  assert(
    documentedFreeRoute?.documentedFreeRoute === true &&
    documentedFreeRoute.codingEligible,
    "OpenRouter free router must remain a documented zero-price usable route.",
  );
  const freeVariant = runtime.catalog.find(
    (entry) => entry.providerId === "openrouter" && entry.modelId === "qwen/qwen-coder:free",
  );
  assert(
    freeVariant?.documentedFreeRoute === true,
    "OpenRouter :free model variants must retain free-route evidence.",
  );
  console.log("GATEWAY-RUNTIME-003 documented OpenRouter free routes: SUCCESS");

  const defaultRoute = selectKingsAiGatewayCodingRoute(runtime);
  assert(
    defaultRoute?.providerId === "omniroute" && defaultRoute.modelId === "auto/coding",
    "Dedicated OmniRoute coding route should remain available to explicit gateway-auto mode.",
  );
  console.log("GATEWAY-RUNTIME-004 explicit gateway-auto route remains intact: SUCCESS");

  const providers = new ProviderAdapterRegistry();
  const capabilities = new ModelCapabilityRegistry();
  const metrics = new Map<string, ModelRoutingMetrics>();
  registerKingsAiGatewayRuntime(runtime, providers, capabilities, metrics);

  assert(providers.list().length === 9, "Every provider adapter must be registered.");
  assert(
    capabilities.get("omniroute", "auto/coding") !== undefined,
    "OmniRoute auto/coding route was not registered in KINGS intelligence.",
  );
  assert(
    capabilities.get("9router", "kr/qwen3-coder-next") !== undefined,
    "9Router discovered coding model was not registered.",
  );
  assert(
    capabilities.get("openrouter", "openrouter/free") !== undefined,
    "OpenRouter free route was not registered in KINGS intelligence.",
  );
  assert(
    capabilities.get("9router", "stale/configured-coder") === undefined,
    "A stale configured 9Router model must not be registered as an executable coding route.",
  );
  assert(
    capabilities.get("omniroute", "auto/coding")?.capabilities.every(
      (profile) => profile.status === "unverified",
    ) === true,
    "A documented route must remain unverified until KINGS executes a real coding acceptance.",
  );
  assert(
    capabilities.get("9router", "kr/qwen3-coder-next")?.capabilities.some(
      (profile) => profile.status === "unverified",
    ) === true,
    "Discovered arbitrary models should remain unverified until KINGS validates them.",
  );

  const openRouterFreeMetric = metrics.get(
    modelRoutingMetricKey("openrouter", "openrouter/free"),
  );
  assert(
    openRouterFreeMetric?.estimatedCost === 0 &&
    openRouterFreeMetric.costBasis === "verified-free",
    "Documented OpenRouter free routes must seed zero-cost evidence for economy routing.",
  );
  const genericGroqMetric = metrics.get(
    modelRoutingMetricKey("groq", "kr/qwen3-coder-next"),
  );
  assert(
    genericGroqMetric?.costBasis === "unknown",
    "K.I.N.G.S. must not pretend a generic direct-provider route is free merely because the provider offers a free plan.",
  );
  console.log("GATEWAY-RUNTIME-005 honest cost provenance + provider registration: SUCCESS");

  const collisionRegistry = new ModelCapabilityRegistry();
  const shared = runtime.gateways[0].adapter.getModel("openai/gpt-coder")?.identity;
  if (!shared) throw new Error("Missing discovered model for collision test.");
  collisionRegistry.register({
    model: shared,
    capabilities: [{
      capability: "coding",
      strength: 80,
      status: "verified",
      evidenceReferences: ["test"],
      verifiedAt: "2026-09-02T00:00:00.000Z",
    }],
  });
  collisionRegistry.register({
    model: { ...shared, providerId: "another-gateway" },
    capabilities: [{
      capability: "coding",
      strength: 80,
      status: "verified",
      evidenceReferences: ["test"],
      verifiedAt: "2026-09-02T00:00:00.000Z",
    }],
  });
  assert(
    collisionRegistry.get("omniroute", "openai/gpt-coder") !== undefined &&
    collisionRegistry.get("another-gateway", "openai/gpt-coder") !== undefined,
    "Provider-scoped model ids must coexist.",
  );
  console.log("GATEWAY-RUNTIME-006 provider-scoped hundreds-model registry: SUCCESS");

  console.log("K.I.N.G.S. AI GATEWAY RUNTIME: SUCCESS");
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
