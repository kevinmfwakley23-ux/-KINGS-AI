import type {
  ModelExecutionRequest,
} from "./model-interface";

import {
  OpenAiCompatibleGatewayAdapter,
  type OpenAiCompatibleGatewayTransport,
} from "./openai-compatible-gateway";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

const capabilities = [
  "reasoning",
  "planning",
  "coding",
  "debugging",
  "source-inspection",
  "verification",
  "recovery",
] as const;

class TestTransport
  implements OpenAiCompatibleGatewayTransport
{
  calls: Array<{
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  }> = [];

  mode:
    | "success"
    | "rate-limit"
    | "invalid" = "success";

  async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ) {
    this.calls.push({ method, path, body });

    if (method === "GET") {
      return {
        status: 200,
        text: "",
        body: {
          data: [
            {
              id: "auto/coding",
              context_length: 200_000,
              supported_parameters: [
                "tools",
                "tool_choice",
                "response_format",
              ],
              architecture: {
                input_modalities: ["text", "image"],
              },
            },
            { id: "kr/claude-sonnet-4.5" },
            { id: "embed-vector" },
          ],
        },
      };
    }

    if (this.mode === "rate-limit") {
      return {
        status: 429,
        text: "rate limited",
        body: {
          error: {
            message: "quota exhausted",
          },
        },
      };
    }

    if (this.mode === "invalid") {
      return {
        status: 200,
        text: "{}",
        body: {},
      };
    }

    return {
      status: 200,
      text: "",
      body: {
        id: "gateway-request-001",
        choices: [
          {
            message: {
              content: "FILE: src/proof.ts [create]\nexport const KINGS_GATEWAY_GREEN = true;",
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      },
    };
  }
}

function request(): ModelExecutionRequest {
  return {
    id: "request-gateway-test",
    taskId: "task-gateway-test",
    missionId: "mission-gateway-test",
    messages: [
      {
        role: "system",
        content: "Return code.",
      },
      {
        role: "user",
        content: "Build a proof file.",
      },
    ],
    requiredCapabilities: [
      "coding",
      "debugging",
    ],
    inputModalities: ["text"],
    outputModality: "text",
    maxOutputTokens: 2_000,
    temperature: 0.1,
    requireStructuredOutput: false,
    allowToolProposals: false,
  };
}

async function runTest(): Promise<void> {
  const transport = new TestTransport();
  const adapter = new OpenAiCompatibleGatewayAdapter(
    {
      id: "omniroute-local",
      name: "OmniRoute",
      gatewayKind: "omniroute",
      baseUrl: "http://127.0.0.1:20128/v1",
      models: [
        {
          modelId: "auto/coding",
          displayName: "OmniRoute auto/coding",
          capabilities,
          // This intentionally has no provenance. Runtime-generated hints must
          // never become trusted execution metadata merely because they exist.
          contextWindowTokens: 200_000,
          supportsToolCalling: true,
          supportsStructuredOutput: true,
        },
      ],
    },
    transport,
  );

  assert(
    adapter.descriptor.id === "omniroute-local",
    "Gateway provider identity was not preserved.",
  );
  assert(
    adapter.gatewayKind === "omniroute",
    "Gateway kind was not preserved.",
  );
  assert(
    adapter.listModels().length === 1,
    "Configured gateway model was not registered.",
  );
  const preDiscovery = adapter.getModel("auto/coding")?.identity;
  assert(
    preDiscovery?.contextWindowTokens === 0 &&
      preDiscovery.supportsToolCalling === false &&
      preDiscovery.supportsStructuredOutput === false &&
      preDiscovery.inputModalities.length === 1 &&
      preDiscovery.inputModalities[0] === "text",
    "Unproven configured metadata must fail closed instead of inheriting optimistic defaults.",
  );

  console.log("GATEWAY-001 provider registration and fail-closed metadata: SUCCESS");

  const health = await adapter.health();
  assert(health.ok, "Gateway health probe failed.");
  assert(
    health.models.includes("auto/coding"),
    "Gateway model discovery did not preserve remote model ids.",
  );
  assert(
    !health.codingModels.includes("embed-vector"),
    "Embedding-only model must not enter the chat/coding catalog.",
  );

  const enriched = adapter.getModel("auto/coding")?.identity;
  const enrichedMetadata = adapter.getModelMetadata("auto/coding");
  assert(
    enriched?.contextWindowTokens === 200_000 &&
      enriched.supportsToolCalling === true &&
      enriched.supportsStructuredOutput === true &&
      enriched.inputModalities.includes("image"),
    "Gateway-reported model metadata did not enrich the configured seed.",
  );
  assert(
    enrichedMetadata?.origin === "configured" &&
      enrichedMetadata.contextWindowTokens.source === "gateway-reported" &&
      enrichedMetadata.supportsToolCalling.source === "gateway-reported" &&
      enrichedMetadata.supportsStructuredOutput.source === "gateway-reported" &&
      enrichedMetadata.inputModalities.source === "gateway-reported",
    "Gateway-reported metadata provenance was not preserved.",
  );

  const opaqueDiscovered = adapter.getModel("kr/claude-sonnet-4.5")?.identity;
  const opaqueMetadata = adapter.getModelMetadata("kr/claude-sonnet-4.5");
  assert(
    opaqueDiscovered?.contextWindowTokens === 0 &&
      opaqueDiscovered.supportsToolCalling === false &&
      opaqueDiscovered.supportsStructuredOutput === false &&
      opaqueDiscovered.inputModalities.length === 1 &&
      opaqueDiscovered.inputModalities[0] === "text" &&
      opaqueMetadata?.origin === "discovered" &&
      opaqueMetadata.contextWindowTokens.source === "unknown",
    "Opaque discovered aliases must remain reachable without invented metadata.",
  );

  console.log("GATEWAY-002 /v1/models metadata discovery and provenance: SUCCESS");

  const result = await adapter.execute(
    "auto/coding",
    request(),
  );

  assert(result.success, "Gateway chat execution failed.");
  assert(
    result.response?.content.includes("KINGS_GATEWAY_GREEN") === true,
    "Gateway response content was not preserved.",
  );
  assert(
    result.response?.usage.tokensUsed === 30,
    "Gateway usage accounting was not preserved.",
  );
  assert(
    transport.calls.some(
      (call) =>
        call.method === "POST" &&
        call.path === "/chat/completions",
    ),
    "OpenAI-compatible chat endpoint was not used.",
  );

  console.log("GATEWAY-003 OpenAI-compatible coding execution: SUCCESS");

  transport.mode = "rate-limit";
  const rateLimited = await adapter.execute(
    "auto/coding",
    request(),
  );
  assert(!rateLimited.success, "HTTP 429 must fail.");
  assert(
    rateLimited.failure?.retryable === true,
    "HTTP 429 must be marked retryable for router fallback.",
  );
  assert(
    rateLimited.failure?.code === "GATEWAY_HTTP_429",
    "HTTP failure code was not normalized.",
  );

  console.log("GATEWAY-004 quota/rate-limit fallback signal: SUCCESS");

  transport.mode = "invalid";
  const invalid = await adapter.execute(
    "auto/coding",
    request(),
  );
  assert(!invalid.success, "Malformed provider response must fail.");
  assert(
    invalid.failure?.code === "GATEWAY_MISSING_CONTENT",
    "Malformed provider response was not classified.",
  );

  console.log("GATEWAY-005 malformed response governance: SUCCESS");

  transport.mode = "success";
  const dynamicResult = await adapter.execute(
    "provider/new-opaque-alias",
    request(),
  );
  assert(
    dynamicResult.success,
    "Dynamic opaque aliases must remain usable for plain text/coding requests.",
  );
  const dynamicIdentity = adapter.getModel("provider/new-opaque-alias")?.identity;
  const dynamicMetadata = adapter.getModelMetadata("provider/new-opaque-alias");
  assert(
    dynamicIdentity?.contextWindowTokens === 0 &&
      dynamicIdentity.supportsToolCalling === false &&
      dynamicIdentity.supportsStructuredOutput === false &&
      dynamicMetadata?.origin === "dynamic" &&
      dynamicMetadata.supportsToolCalling.source === "unknown",
    "Dynamic aliases must not inherit invented gateway capabilities.",
  );

  const unsafeToolRequest: ModelExecutionRequest = {
    ...request(),
    id: "request-gateway-tool-safety",
    allowToolProposals: true,
    toolDefinitions: [
      {
        toolId: "repo.read",
        description: "Read a repository file.",
        inputSchema: { type: "object" },
      },
    ],
  };
  const rejectedToolUse = await adapter.execute(
    "provider/another-opaque-alias",
    unsafeToolRequest,
  );
  assert(
    !rejectedToolUse.success &&
      rejectedToolUse.failure?.code === "CAPABILITY_MISMATCH",
    "Opaque dynamic aliases must fail closed when tool support is unverified.",
  );

  console.log("GATEWAY-006 dynamic alias metadata safety: SUCCESS");

  const trustedConfigured = new OpenAiCompatibleGatewayAdapter(
    {
      id: "trusted-config",
      name: "Trusted Config",
      gatewayKind: "openai-compatible",
      baseUrl: "http://127.0.0.1:9999/v1",
      discoverModels: false,
      models: [
        {
          modelId: "verified/local-model",
          capabilities,
          inputModalities: ["text", "image"],
          contextWindowTokens: 64_000,
          supportsToolCalling: true,
          supportsStructuredOutput: true,
          metadataProvenance: {
            inputModalities: "configured",
            contextWindowTokens: "configured",
            supportsToolCalling: "configured",
            supportsStructuredOutput: "configured",
          },
        },
      ],
    },
    new TestTransport(),
  );
  const trustedIdentity = trustedConfigured.getModel("verified/local-model")?.identity;
  const trustedMetadata = trustedConfigured.getModelMetadata("verified/local-model");
  assert(
    trustedIdentity?.contextWindowTokens === 64_000 &&
      trustedIdentity.supportsToolCalling === true &&
      trustedIdentity.supportsStructuredOutput === true &&
      trustedIdentity.inputModalities.includes("image") &&
      trustedMetadata?.contextWindowTokens.source === "configured",
    "Explicitly proven configured metadata must remain available to routing and execution.",
  );

  console.log("GATEWAY-007 explicit configured metadata provenance: SUCCESS");

  const nineRouter = new OpenAiCompatibleGatewayAdapter(
    {
      id: "9router-local",
      name: "9Router",
      gatewayKind: "9router",
      baseUrl: "http://127.0.0.1:20128",
      models: [
        {
          modelId: "kr/claude-sonnet-4.5",
          capabilities,
        },
      ],
    },
    new TestTransport(),
  );

  assert(
    nineRouter.gatewayKind === "9router",
    "9Router must use the same hardened gateway boundary.",
  );
  assert(
    nineRouter.getModel("kr/claude-sonnet-4.5") !== undefined,
    "9Router model was not usable through the shared adapter.",
  );

  console.log("GATEWAY-008 9Router implementation: SUCCESS");
  console.log("K.I.N.G.S. OPENAI-COMPATIBLE GATEWAYS: SUCCESS");
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
