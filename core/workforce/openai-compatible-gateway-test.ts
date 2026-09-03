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
            { id: "auto/coding" },
            { id: "kr/claude-sonnet-4.5" },
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
          contextWindowTokens: 200_000,
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

  console.log("GATEWAY-001 provider registration: SUCCESS");

  const health = await adapter.health();
  assert(health.ok, "Gateway health probe failed.");
  assert(
    health.models.includes("auto/coding"),
    "Gateway model discovery did not preserve remote model ids.",
  );

  console.log("GATEWAY-002 /v1/models health discovery: SUCCESS");

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

  console.log("GATEWAY-006 9Router implementation: SUCCESS");
  console.log("K.I.N.G.S. OPENAI-COMPATIBLE GATEWAYS: SUCCESS");
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
