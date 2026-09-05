import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";
import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "./provider-adapters";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { AppAiRouter, AppAiRouterError } from "./app-ai-router";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeModel implements IntelligenceModel {
  constructor(
    readonly identity: ModelIdentity,
    private readonly run: (request: ModelExecutionRequest) => Promise<ModelExecutionResult>,
  ) {}

  canHandle(request: ModelExecutionRequest): boolean {
    return request.requiredCapabilities.every((capability) => this.identity.capabilities.includes(capability));
  }

  execute(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    return this.run(request);
  }
}

class FakeAdapter implements ProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  private readonly models = new Map<string, FakeModel>();

  constructor(
    id: string,
    modelId: string,
    capabilities: ModelIdentity["capabilities"],
    private readonly result: "success" | "failure",
  ) {
    this.descriptor = { id, name: id, kind: "external-free", available: true };
    const identity: ModelIdentity = {
      providerId: id,
      modelId,
      displayName: `${id}/${modelId}`,
      providerKind: "external-free",
      capabilities,
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindowTokens: 128_000,
      supportsToolCalling: true,
      supportsStructuredOutput: true,
      available: true,
    };
    this.models.set(modelId, new FakeModel(identity, async (request) => {
      const startedAt = new Date().toISOString();
      if (this.result === "failure") {
        return {
          success: false,
          failure: {
            requestId: request.id,
            providerId: id,
            modelId,
            retryable: true,
            code: "TEST_PROVIDER_FAILURE",
            message: "Synthetic provider failure",
            metadata: {
              requestId: request.id,
              startedAt,
              completedAt: startedAt,
              latencyMs: 0,
            },
          },
        };
      }
      return {
        success: true,
        response: {
          requestId: request.id,
          model: identity,
          content: `answer from ${id}`,
          toolCallProposals: [{ id: "tool-1", toolId: "lookup", arguments: { item: "coin" } }],
          usage: {
            elapsedMs: 9,
            tokensUsed: 15,
            iterationsUsed: 1,
            inputTokens: 10,
            outputTokens: 5,
            estimatedCost: 0.01,
          },
          metadata: {
            requestId: request.id,
            startedAt,
            completedAt: startedAt,
            latencyMs: 9,
          },
        },
      };
    }));
  }

  listModels(): readonly ModelIdentity[] {
    return [...this.models.values()].map((model) => model.identity);
  }

  getModel(modelId: string): IntelligenceModel | undefined {
    return this.models.get(modelId);
  }

  execute(modelId: string, request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const model = this.models.get(modelId);
    if (!model) throw new Error(`missing fake model ${modelId}`);
    return model.execute(request);
  }
}

async function main(): Promise<void> {
  const providers = new ProviderAdapterRegistry();
  providers.register(new FakeAdapter("primary", "auto", ["reasoning", "research"], "failure"));
  providers.register(new FakeAdapter("secondary", "auto", ["reasoning", "research"], "success"));
  providers.register(new FakeAdapter("coding", "coder", ["reasoning", "coding"], "success"));

  const router = new AppAiRouter(providers, ["primary", "secondary", "coding"]);
  const fallback = await router.route({
    appId: "kings.collectors",
    requestId: "request-fallback",
    messages: [{ role: "user", content: "Estimate the context for this collectible." }],
    requiredCapabilities: ["reasoning", "research"],
    maxOutputTokens: 512,
  });
  assert(fallback.success, "router did not fall back to the next eligible provider");
  assert(fallback.providerId === "secondary", "router selected the wrong fallback provider");
  assert(fallback.attempts.length === 2, "router did not preserve routing attempt evidence");
  assert(fallback.toolCallProposals.length === 1, "router dropped provider tool proposals");
  assert(fallback.usage.totalTokens === 15, "router did not normalize token usage");

  const coding = await router.route({
    appId: "authors.forge",
    messages: [{ role: "user", content: "Review this code." }],
    requiredCapabilities: ["coding"],
  });
  assert(coding.success && coding.providerId === "coding", "capability filtering did not select the coding provider");

  const explicit = await router.route({
    appId: "kings.collectors",
    messages: [{ role: "user", content: "Use only the primary route." }],
    requiredCapabilities: ["reasoning"],
    providerId: "primary",
  });
  assert(!explicit.success, "explicit provider request unexpectedly fell back to another provider");
  assert(explicit.attempts.length === 1, "explicit provider request attempted more than one provider");

  let rejected = false;
  try {
    await router.route({
      appId: "INVALID APP ID",
      messages: [{ role: "user", content: "hello" }],
    });
  } catch (error) {
    rejected = error instanceof AppAiRouterError && error.code === "INVALID_APP_ID";
  }
  assert(rejected, "invalid app identity was not rejected");

  console.log("App AI router test: PASSED");
}

void main().catch((error) => {
  console.error("App AI router test: FAILED");
  console.error(error);
  process.exitCode = 1;
});
