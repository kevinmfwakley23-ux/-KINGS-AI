import { strict as assert } from "node:assert";
import {
  loadKingsAiGatewayRuntime,
  refreshKingsAiGatewayRuntime,
  registerKingsAiGatewayRuntime,
  synchronizeKingsAiGatewayRuntime,
} from "./ai-gateway-runtime";
import type { OpenAiCompatibleGatewayTransport } from "./openai-compatible-gateway";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";

async function main(): Promise<void> {
  let calls = 0;
  const transport: OpenAiCompatibleGatewayTransport = {
    async request(method, path) {
      assert.equal(method, "GET");
      assert.equal(path, "/models");
      calls += 1;
      return {
        status: 200,
        body: {
          data: [
            { id: "auto/coding" },
            { id: "provider/coder-two" },
          ],
        },
        text: "catalog",
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

  const providers = new ProviderAdapterRegistry();
  const capabilities = new ModelCapabilityRegistry();
  const metrics = new Map<string, ModelRoutingMetrics>();
  registerKingsAiGatewayRuntime(runtime, providers, capabilities, metrics);

  const key = modelRoutingMetricKey("omniroute", "auto/coding");
  assert.ok(metrics.has(key));

  const learned: ModelRoutingMetrics = {
    estimatedCost: 0.018,
    costBasis: "provider-reported",
    latencyMs: 410,
    reliability: 97,
  };
  metrics.set(key, learned);

  const refreshed = await refreshKingsAiGatewayRuntime(runtime);
  synchronizeKingsAiGatewayRuntime(
    refreshed,
    providers,
    capabilities,
    metrics,
  );

  assert.deepEqual(
    metrics.get(key),
    learned,
    "routine gateway refresh must preserve learned route performance evidence",
  );
  assert.equal(
    capabilities.get("omniroute", "auto/coding")?.model.available,
    true,
  );
  assert.equal(calls, 2, "startup and refresh must each query the live catalog");

  console.log("K.I.N.G.S. ADAPTIVE ROUTING → LIVE CATALOG REFRESH PRESERVES EVIDENCE: SUCCESS");
  console.log("K.I.N.G.S. ADAPTIVE ROUTING → AVAILABILITY STILL REFRESHES: SUCCESS");
  console.log("TREE-KCM-ADAPTIVE-GATEWAY-REFRESH: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-ADAPTIVE-GATEWAY-REFRESH: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
