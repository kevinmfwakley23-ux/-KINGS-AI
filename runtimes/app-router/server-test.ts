import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "../../core/workforce/model-interface";
import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "../../core/workforce/provider-adapters";
import { ProviderAdapterRegistry } from "../../core/workforce/provider-adapters";
import { createAppRouterRuntime } from "./server";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

class TestModel implements IntelligenceModel {
  readonly identity: ModelIdentity = {
    providerId: "verified",
    modelId: "coding-model",
    displayName: "Verified coding model",
    providerKind: "external-free",
    capabilities: ["reasoning", "coding", "debugging"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens: 128_000,
    supportsToolCalling: false,
    supportsStructuredOutput: false,
    available: true,
  };

  canHandle(): boolean {
    return true;
  }

  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const now = new Date().toISOString();
    return {
      success: true,
      response: {
        requestId: request.id,
        model: this.identity,
        content: "verified answer",
        toolCallProposals: [],
        usage: {
          elapsedMs: 1,
          tokensUsed: 2,
          iterationsUsed: 1,
          inputTokens: 1,
          outputTokens: 1,
          estimatedCost: 0,
        },
        metadata: {
          requestId: request.id,
          startedAt: now,
          completedAt: now,
          latencyMs: 1,
        },
      },
    };
  }
}

class TestAdapter implements ProviderAdapter {
  readonly descriptor: ProviderDescriptor = {
    id: "verified",
    name: "Verified",
    kind: "external-free",
    available: true,
  };
  private readonly model = new TestModel();

  listModels(): readonly ModelIdentity[] {
    return [this.model.identity];
  }

  getModel(modelId: string): IntelligenceModel | undefined {
    return modelId === this.model.identity.modelId ? this.model : undefined;
  }

  execute(modelId: string, request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const model = this.getModel(modelId);
    if (!model) throw new Error("missing test model");
    return model.execute(request);
  }
}

async function listen(server: ReturnType<typeof createAppRouterRuntime>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object", "server did not expose a TCP address");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createAppRouterRuntime>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function main(): Promise<void> {
  const emptyServer = createAppRouterRuntime({
    host: "127.0.0.1",
    port: 8790,
    providerOrder: ["verified"],
  });
  const emptyUrl = await listen(emptyServer);
  try {
    const health = await fetch(`${emptyUrl}/health`);
    const body = await health.json() as { ok?: boolean };
    assert(health.status === 503 && body.ok === false, "router must fail health when no provider is verified");
  } finally {
    await close(emptyServer);
  }

  const registry = new ProviderAdapterRegistry();
  registry.register(new TestAdapter());
  const healthyServer = createAppRouterRuntime({
    host: "127.0.0.1",
    port: 8790,
    providerOrder: ["verified"],
  }, registry);
  const healthyUrl = await listen(healthyServer);
  try {
    const health = await fetch(`${healthyUrl}/health`);
    assert(health.status === 200, "verified provider should make router health pass");

    const route = await fetch(`${healthyUrl}/v1/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appId: "authors.forge",
        messages: [{ role: "user", content: "Fix this code." }],
        requiredCapabilities: ["coding"],
      }),
    });
    const result = await route.json() as { success?: boolean; providerId?: string };
    assert(route.status === 200 && result.success === true, "verified coding route should execute through HTTP boundary");
    assert(result.providerId === "verified", "HTTP route returned the wrong provider");
  } finally {
    await close(healthyServer);
  }

  console.log("App router verified-provider runtime boundary: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
