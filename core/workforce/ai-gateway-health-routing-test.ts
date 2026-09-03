import {
  loadKingsAiGatewayRuntime,
  refreshKingsAiGatewayRuntime,
  registerKingsAiGatewayRuntime,
  synchronizeKingsAiGatewayRuntime,
} from "./ai-gateway-runtime";
import type {
  OpenAiCompatibleGatewayTransport,
} from "./openai-compatible-gateway";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import type { ModelRoutingMetrics } from "./model-routing";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  let healthy = false;
  let healthChecks = 0;

  const transport: OpenAiCompatibleGatewayTransport = {
    async request(method, path) {
      assert(method === "GET", "health regression should only perform model discovery");
      assert(path === "/models", "health regression must use the OpenAI-compatible model catalog");
      healthChecks += 1;

      if (!healthy) {
        return {
          status: 503,
          body: { error: { message: "gateway unavailable" } },
          text: "gateway unavailable",
        };
      }

      return {
        status: 200,
        body: {
          data: [
            { id: "auto/coding" },
            { id: "auto" },
          ],
        },
        text: JSON.stringify({
          data: [
            { id: "auto/coding" },
            { id: "auto" },
          ],
        }),
      };
    },
  };

  const runtime = await loadKingsAiGatewayRuntime({
    env: {
      KINGS_OMNIROUTE_URL: "https://omniroute.invalid",
    },
    transportFactory() {
      return transport;
    },
  });

  assert(runtime.gateways.length === 1, "OmniRoute must be configured");
  const gateway = runtime.gateways[0];
  assert(!gateway.health.ok, "initial gateway health must fail");
  assert(!gateway.adapter.descriptor.available, "failed gateway must be unavailable to provider routing");

  const autoCoding = gateway.adapter.getModel("auto/coding");
  assert(autoCoding, "OmniRoute auto/coding seed must exist even while the gateway is down");
  assert(!autoCoding.identity.available, "failed gateway model must be unavailable to model routing");

  const providers = new ProviderAdapterRegistry();
  const capabilities = new ModelCapabilityRegistry();
  const metrics = new Map<string, ModelRoutingMetrics>();
  registerKingsAiGatewayRuntime(runtime, providers, capabilities, metrics);

  assert(
    providers.listAvailable().length === 0,
    "provider registry must exclude a gateway whose live health failed",
  );
  assert(
    capabilities.discover({
      providerId: "omniroute",
      modelId: "auto/coding",
      availableOnly: true,
      verifiedOnly: true,
      requiredCapabilities: ["coding"],
    }).length === 0,
    "model routing must exclude verified routes while their gateway is unhealthy",
  );

  healthy = true;
  const refreshed = await refreshKingsAiGatewayRuntime(runtime);
  synchronizeKingsAiGatewayRuntime(refreshed, providers, capabilities, metrics);

  assert(refreshed.gateways[0].health.ok, "gateway refresh must observe recovery");
  assert(
    gateway.adapter.descriptor.available,
    "recovered gateway must become available through the existing provider registry reference",
  );
  assert(
    autoCoding.identity.available,
    "recovered auto/coding model must become available through the existing capability registry reference",
  );
  assert(
    providers.listAvailable().some((provider) => provider.id === "omniroute"),
    "provider registry must see gateway recovery without re-registration",
  );

  const recovered = capabilities.discover({
    providerId: "omniroute",
    modelId: "auto/coding",
    availableOnly: true,
    verifiedOnly: true,
    requiredCapabilities: ["coding"],
  });
  assert(recovered.length === 1, "verified auto/coding route must return after gateway recovery");
  assert(healthChecks === 2, "startup and recovery must each perform one live health check");

  let dynamicHealthy = false;
  const dynamicTransport: OpenAiCompatibleGatewayTransport = {
    async request(method, path) {
      assert(method === "GET", "dynamic recovery should only perform model discovery");
      assert(path === "/models", "dynamic recovery must query the model catalog");
      if (!dynamicHealthy) {
        return {
          status: 503,
          body: { error: { message: "9Router unavailable" } },
          text: "9Router unavailable",
        };
      }
      return {
        status: 200,
        body: {
          data: [
            { id: "provider/coder-large" },
            { id: "provider/embedding-small" },
          ],
        },
        text: "dynamic catalog",
      };
    },
  };

  const dynamicRuntime = await loadKingsAiGatewayRuntime({
    env: {
      KINGS_9ROUTER_URL: "https://9router.invalid",
    },
    transportFactory() {
      return dynamicTransport;
    },
  });
  const dynamicProviders = new ProviderAdapterRegistry();
  const dynamicCapabilities = new ModelCapabilityRegistry();
  const dynamicMetrics = new Map<string, ModelRoutingMetrics>();
  registerKingsAiGatewayRuntime(
    dynamicRuntime,
    dynamicProviders,
    dynamicCapabilities,
    dynamicMetrics,
  );
  assert(
    dynamicCapabilities.list().length === 0,
    "a startup-down 9Router with no configured seeds must not invent routable models",
  );

  dynamicHealthy = true;
  const dynamicRefreshed = await refreshKingsAiGatewayRuntime(dynamicRuntime);
  const synchronization = synchronizeKingsAiGatewayRuntime(
    dynamicRefreshed,
    dynamicProviders,
    dynamicCapabilities,
    dynamicMetrics,
  );

  assert(
    synchronization.registeredModels === 1,
    "runtime synchronization must register the newly discovered coding model",
  );
  assert(
    dynamicCapabilities.discover({
      providerId: "9router",
      modelId: "provider/coder-large",
      availableOnly: true,
      requiredCapabilities: ["coding"],
    }).length === 1,
    "late-discovered 9Router coding models must enter the active capability registry",
  );
  assert(
    dynamicCapabilities.get("9router", "provider/embedding-small") === undefined,
    "non-coding models must not enter the coding capability registry",
  );

  console.log("K.I.N.G.S. GATEWAY HEALTH → ROUTING EXCLUSION: SUCCESS");
  console.log("K.I.N.G.S. GATEWAY HEALTH → LIVE RECOVERY: SUCCESS");
  console.log("K.I.N.G.S. GATEWAY REFRESH → LATE MODEL REGISTRATION: SUCCESS");
  console.log("TREE-KCM-GATEWAY-HEALTH-ROUTING: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-GATEWAY-HEALTH-ROUTING: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
