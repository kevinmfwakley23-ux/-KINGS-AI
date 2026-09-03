import {
  configuredGatewayDefinitions,
  loadKingsAiGatewayRuntime,
  registerKingsAiGatewayRuntime,
} from "./ai-gateway-runtime";
import type {
  OpenAiCompatibleGatewayConfig,
  OpenAiCompatibleGatewayTransport,
} from "./openai-compatible-gateway";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import type { ModelRoutingMetrics } from "./model-routing";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

class CatalogTransport implements OpenAiCompatibleGatewayTransport {
  constructor(private readonly kind: string) {}

  async request(method: "GET" | "POST", path: string) {
    if (method === "GET" && path === "/models") {
      const models = this.kind === "omniroute"
        ? [
            "auto/coding",
            "auto",
            "openai/gpt-coder",
            "anthropic/claude-sonnet",
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
  } as NodeJS.ProcessEnv;

  const definitions = configuredGatewayDefinitions(env);
  assert(definitions.length === 2, "Both first-class gateways must be configured.");
  assert(
    definitions.some((item) => item.gatewayKind === "omniroute"),
    "OmniRoute definition missing.",
  );
  assert(
    definitions.some((item) => item.gatewayKind === "9router"),
    "9Router definition missing.",
  );
  console.log("GATEWAY-RUNTIME-001 first-class OmniRoute + 9Router config: SUCCESS");

  const runtime = await loadKingsAiGatewayRuntime({
    env,
    transportFactory(config: OpenAiCompatibleGatewayConfig) {
      return new CatalogTransport(config.gatewayKind);
    },
  });

  assert(runtime.gateways.length === 2, "Gateway runtime did not load both routers.");
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
    !runtime.catalog.some((entry) => entry.modelId === "image/flux-pro"),
    "Image-only models must not enter the coding execution catalog.",
  );
  assert(
    !runtime.catalog.some((entry) => entry.modelId === "audio/tts-1"),
    "Audio-only models must not enter the coding execution catalog.",
  );
  console.log("GATEWAY-RUNTIME-002 live /v1/models discovery + coding filter: SUCCESS");

  const providers = new ProviderAdapterRegistry();
  const capabilities = new ModelCapabilityRegistry();
  const metrics = new Map<string, ModelRoutingMetrics>();
  registerKingsAiGatewayRuntime(runtime, providers, capabilities, metrics);

  assert(providers.list().length === 2, "Gateway adapters were not registered.");
  assert(
    capabilities.get("omniroute", "auto/coding") !== undefined,
    "OmniRoute auto/coding route was not registered in KINGS intelligence.",
  );
  assert(
    capabilities.get("9router", "kr/qwen3-coder-next") !== undefined,
    "9Router discovered coding model was not registered.",
  );
  assert(
    capabilities.get("omniroute", "auto/coding")?.capabilities.every(
      (profile) => profile.status === "verified",
    ) === true,
    "Documented OmniRoute auto/coding route should be verified.",
  );
  assert(
    capabilities.get("9router", "kr/qwen3-coder-next")?.capabilities.some(
      (profile) => profile.status === "unverified",
    ) === true,
    "Discovered arbitrary models should remain unverified until KINGS validates them.",
  );
  console.log("GATEWAY-RUNTIME-003 catalog registration with honest verification state: SUCCESS");

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
  console.log("GATEWAY-RUNTIME-004 provider-scoped hundreds-model registry: SUCCESS");

  console.log("K.I.N.G.S. AI GATEWAY RUNTIME: SUCCESS");
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
