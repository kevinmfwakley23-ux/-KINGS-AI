import {
  OpenAICompatibleGatewayAdapter,
  createConfiguredGatewayAdapters,
  createNineRouterAdapter,
  createOmniRouteAdapter,
} from "./openai-compatible-gateway";
import type { ModelExecutionRequest } from "./model-interface";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function main(): Promise<void> {
  const unconfigured = createConfiguredGatewayAdapters({});
  assert(unconfigured.length === 0, "Unconfigured gateways must not be advertised as available");

  const discovered = createConfiguredGatewayAdapters({
    KINGS_OMNIROUTE_BASE_URL: "https://omniroute.example/v1",
    KINGS_OMNIROUTE_MODELS: "auto/coding",
    KINGS_9ROUTER_BASE_URL: "https://9router.example/v1",
    KINGS_9ROUTER_MODELS: "auto",
  });
  assert(discovered.length === 2, "Configured gateways must be discovered");
  assert(discovered.some((adapter) => adapter.descriptor.id === "omniroute"), "Configured OmniRoute gateway was not discovered");
  assert(discovered.some((adapter) => adapter.descriptor.id === "9router"), "Configured 9Router gateway was not discovered");

  const omni = createOmniRouteAdapter({
    KINGS_OMNIROUTE_BASE_URL: "http://localhost:20128/v1/",
    KINGS_OMNIROUTE_MODELS: "auto/coding,auto/cheap",
  });
  assert(omni.descriptor.id === "omniroute", "OmniRoute provider id was not preserved");
  assert(omni.listModels().length === 2, "OmniRoute models were not parsed");

  const nine = createNineRouterAdapter({
    KINGS_9ROUTER_BASE_URL: "http://localhost:20129/v1",
    KINGS_9ROUTER_MODELS: "auto,cheap",
  });
  assert(nine.descriptor.id === "9router", "9Router provider id was not preserved");
  assert(nine.listModels().length === 2, "9Router models were not parsed");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model?: string; max_tokens?: number };
    assert(body.model === "auto/coding", "Gateway virtual model must pass through unchanged");
    assert(body.max_tokens === 321, "Output token cap must pass through");
    return new Response(JSON.stringify({
      id: "gateway-request-1",
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const request: ModelExecutionRequest = {
    id: "req-1", taskId: "task-1", missionId: "mission-1",
    messages: [{ role: "user", content: "hello" }],
    requiredCapabilities: ["coding"],
    inputModalities: ["text"], outputModality: "text",
    maxOutputTokens: 321, allowToolProposals: false,
  };
  try {
    const result = await omni.execute("auto/coding", request);
    assert(result.success, "Gateway execution should succeed");
    assert(result.response?.usage.inputTokens === 12, "Input token usage was not preserved");
    assert(result.response?.usage.outputTokens === 3, "Output token usage was not preserved");
    assert(result.response?.usage.tokensUsed === 15, "Total token usage was not preserved");
  } finally {
    globalThis.fetch = originalFetch;
  }

  let rejected = false;
  try {
    new OpenAICompatibleGatewayAdapter({
      providerId: "bad", name: "Bad", baseUrl: "file:///tmp/socket", models: [{ id: "m" }],
    });
  } catch { rejected = true; }
  assert(rejected, "Non-HTTP gateway URL must be rejected");

  console.log("OpenAI-compatible OmniRoute/9Router gateway connector: SUCCESS");

}

main().catch((error) => { console.error(error); process.exitCode = 1; });
