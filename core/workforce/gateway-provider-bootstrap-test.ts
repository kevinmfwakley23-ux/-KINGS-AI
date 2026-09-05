import {
  bootstrapVerifiedGatewayProviders,
  profileVerifiedGatewayModel,
} from "./gateway-provider-bootstrap";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main(): Promise<void> {
  const codingProfile = profileVerifiedGatewayModel("auto/coding");
  assert(codingProfile.capabilities?.includes("coding"), "auto/coding must be classified as coding capable");
  assert(codingProfile.capabilities?.includes("debugging"), "auto/coding must be classified as debugging capable");
  assert(codingProfile.supportsToolCalling === false, "unverified tool calling must not be advertised");
  assert(codingProfile.supportsStructuredOutput === false, "unverified structured output must not be advertised");

  const cheapProfile = profileVerifiedGatewayModel("auto/cheap");
  assert(!cheapProfile.capabilities?.includes("coding"), "cheap route must not masquerade as a coding route");

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      assert(url === "http://router.test/v1/models", "bootstrap must verify the standard model catalog endpoint");
      return new Response(JSON.stringify({
        data: [
          { id: "auto" },
          { id: "auto/coding" },
          { id: "auto/smart" },
          { id: "auto/cheap" },
          { id: "auto/fast" },
          { id: "random-weak-model" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const verified = await bootstrapVerifiedGatewayProviders({
      KINGS_OMNIROUTE_BASE_URL: "http://router.test/v1",
      KINGS_CONNECTOR_HEALTH_TIMEOUT_MS: "1000",
    });

    assert(verified.registry.listAvailable().length === 1, "verified OmniRoute gateway should be registered");
    assert(verified.registry.get("omniroute")?.listModels().some((model) => model.modelId === "auto/coding"), "quality-first coding alias should be routable");
    assert(!verified.registry.get("omniroute")?.listModels().some((model) => model.modelId === "random-weak-model"), "unprofiled weak model should not enter automatic routing");
    assert(verified.statuses[0]?.verified === true, "verified provider status should be preserved");

    const explicit = await bootstrapVerifiedGatewayProviders({
      KINGS_OMNIROUTE_BASE_URL: "http://router.test/v1",
      KINGS_OMNIROUTE_MODELS: "auto/smart,missing-model",
      KINGS_CONNECTOR_HEALTH_TIMEOUT_MS: "1000",
    });
    const explicitModels = explicit.registry.get("omniroute")?.listModels() ?? [];
    assert(explicitModels.length === 1 && explicitModels[0]?.modelId === "auto/smart", "configured model allowlist must be intersected with the verified catalog");

    globalThis.fetch = async () => {
      throw new Error("connection refused");
    };
    const unreachable = await bootstrapVerifiedGatewayProviders({
      KINGS_9ROUTER_BASE_URL: "http://router.test/v1",
      KINGS_CONNECTOR_HEALTH_TIMEOUT_MS: "1000",
    });
    assert(unreachable.registry.listAvailable().length === 0, "unreachable gateway must not be advertised as available");
    const nine = unreachable.statuses.find((status) => status.providerId === "9router");
    assert(nine?.configured === true && nine.verified === false, "unreachable gateway status must fail closed");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("Verified gateway provider bootstrap: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
