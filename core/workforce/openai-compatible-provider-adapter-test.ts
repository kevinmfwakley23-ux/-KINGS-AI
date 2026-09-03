import type {
  ModelExecutionRequest,
  ModelIdentity,
} from "./model-interface";
import {
  OpenAICompatibleProviderAdapter,
  type OpenAICompatibleHttpResult,
  type OpenAICompatibleHttpTransport,
} from "./openai-compatible-provider-adapter";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const identity: ModelIdentity = {
  providerId: "provider-compatible",
  modelId: "vendor/coder-pro",
  displayName: "Compatible Coder Pro",
  providerKind: "external-paid",
  capabilities: ["coding", "reasoning", "structured-output"],
  inputModalities: ["text"],
  outputModalities: ["text"],
  contextWindowTokens: 128_000,
  supportsToolCalling: true,
  supportsStructuredOutput: true,
  available: true,
};

class FakeTransport implements OpenAICompatibleHttpTransport {
  calls: Array<{
    url: string;
    headers: Readonly<Record<string, string>>;
    body: unknown;
    timeoutMs: number;
  }> = [];

  constructor(
    private readonly results: OpenAICompatibleHttpResult[],
  ) {}

  async post(
    url: string,
    headers: Readonly<Record<string, string>>,
    body: unknown,
    timeoutMs: number,
  ): Promise<OpenAICompatibleHttpResult> {
    this.calls.push({ url, headers, body, timeoutMs });
    const result = this.results.shift();
    if (!result) throw new Error("Fake transport exhausted.");
    return result;
  }
}

function request(overrides: Partial<ModelExecutionRequest> = {}): ModelExecutionRequest {
  return {
    id: "request-compatible",
    taskId: "task-compatible",
    missionId: "mission-compatible",
    messages: [{ role: "user", content: "Return a verified structured coding answer." }],
    requiredCapabilities: ["coding"],
    inputModalities: ["text"],
    outputModality: "text",
    maxOutputTokens: 512,
    temperature: 0.1,
    requireStructuredOutput: true,
    allowToolProposals: true,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const transport = new FakeTransport([
    {
      status: 200,
      body: {
        id: "provider-request-123",
        choices: [{
          message: {
            content: "{\"ok\":true}",
            tool_calls: [{
              id: "call-1",
              function: {
                name: "inspect_repository",
                arguments: "{\"path\":\"src\"}",
              },
            }],
          },
        }],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 40,
          total_tokens: 160,
          cost: 0.0042,
        },
      },
    },
  ]);

  const adapter = new OpenAICompatibleProviderAdapter({
    providerId: "provider-compatible",
    name: "Compatible Provider",
    baseUrl: "https://gateway.example.test/v1/",
    apiKey: "test-secret",
    requestTimeoutMs: 15_000,
    headers: { "X-Kings-Test": "enabled" },
    models: [identity],
  }, transport);

  const result = await adapter.execute(identity.modelId, request());
  assert(result.success, "Valid OpenAI-compatible response did not execute successfully.");
  assert(result.response?.content === "{\"ok\":true}", "Provider text content was not preserved.");
  assert(result.response?.usage.inputTokens === 120, "Input-token usage was not captured.");
  assert(result.response?.usage.outputTokens === 40, "Output-token usage was not captured.");
  assert(result.response?.usage.tokensUsed === 160, "Total-token usage was not captured.");
  assert(result.response?.usage.estimatedCost === 0.0042, "Provider-reported cost was not captured.");
  assert(result.response?.metadata.providerRequestId === "provider-request-123", "Provider request id was not preserved.");
  assert(result.response?.toolCallProposals[0]?.toolId === "inspect_repository", "Tool-call proposal name was not mapped into the governed proposal contract.");
  assert(result.response?.toolCallProposals[0]?.arguments.path === "src", "Tool-call JSON arguments were not parsed safely.");

  const call = transport.calls[0];
  assert(call.url === "https://gateway.example.test/v1/chat/completions", "OpenAI-compatible endpoint URL was built incorrectly.");
  assert(call.headers.Authorization === "Bearer test-secret", "Bearer authorization was not attached.");
  assert(call.headers["X-Kings-Test"] === "enabled", "Governed custom headers were not retained.");
  assert(call.timeoutMs === 15_000, "Configured request timeout was not enforced at the transport boundary.");
  const sentBody = call.body as Record<string, unknown>;
  assert(sentBody.model === identity.modelId, "Selected model id was not sent to the provider.");
  assert((sentBody.response_format as { type?: unknown })?.type === "json_object", "Structured-output request was not translated.");
  assert(sentBody.max_tokens === 512, "Output-token ceiling was not translated.");

  const retryTransport = new FakeTransport([{ status: 429, body: { error: { message: "rate limited" } } }]);
  const retryAdapter = new OpenAICompatibleProviderAdapter({
    providerId: "provider-compatible",
    name: "Compatible Provider",
    baseUrl: "https://gateway.example.test/v1",
    models: [identity],
  }, retryTransport);
  const retryResult = await retryAdapter.execute(identity.modelId, request());
  assert(!retryResult.success, "HTTP 429 incorrectly succeeded.");
  assert(retryResult.failure?.retryable === true, "HTTP 429 must be retryable for governed fallback.");
  assert(retryResult.failure?.code === "OPENAI_COMPATIBLE_HTTP_429", "HTTP failure code did not preserve status evidence.");

  const authTransport = new FakeTransport([{ status: 401, body: { error: { message: "invalid key" } } }]);
  const authAdapter = new OpenAICompatibleProviderAdapter({
    providerId: "provider-compatible",
    name: "Compatible Provider",
    baseUrl: "https://gateway.example.test/v1",
    models: [identity],
  }, authTransport);
  const authResult = await authAdapter.execute(identity.modelId, request());
  assert(authResult.failure?.retryable === false, "Authentication failures must not churn through retries as transient failures.");

  const forbiddenToolTransport = new FakeTransport([{
    status: 200,
    body: {
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call-forbidden",
            function: { name: "dangerous_tool", arguments: "{}" },
          }],
        },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  }]);
  const forbiddenToolAdapter = new OpenAICompatibleProviderAdapter({
    providerId: "provider-compatible",
    name: "Compatible Provider",
    baseUrl: "https://gateway.example.test/v1",
    models: [identity],
  }, forbiddenToolTransport);
  const forbiddenTool = await forbiddenToolAdapter.execute(identity.modelId, request({ allowToolProposals: false }));
  assert(forbiddenTool.failure?.code === "OPENAI_COMPATIBLE_UNAUTHORIZED_TOOL_PROPOSAL", "Unauthorized tool proposal was not blocked.");

  const multimodal = await adapter.execute(identity.modelId, request({ inputModalities: ["image"] }));
  assert(multimodal.failure?.code === "OPENAI_COMPATIBLE_CAPABILITY_MISMATCH", "Unsupported multimodal request must be rejected instead of silently dropping data.");

  console.log("OpenAI-compatible request translation: SUCCESS");
  console.log("Usage and provider request evidence: SUCCESS");
  console.log("Tool-call proposal parsing and authorization: SUCCESS");
  console.log("Retryable/non-retryable HTTP classification: SUCCESS");
  console.log("Non-text input honesty boundary: SUCCESS");
  console.log("TREE-04 OPENAI-COMPATIBLE PROVIDER: SUCCESS");
}

main().catch((error: unknown) => {
  console.error("=== K.I.N.G.S. OPENAI-COMPATIBLE PROVIDER TEST FAILED ===");
  console.error(error);
  process.exitCode = 1;
});
