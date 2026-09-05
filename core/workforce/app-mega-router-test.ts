import {
  AppMegaRouter,
} from "./app-mega-router";
import {
  ModelCapabilityRegistry,
} from "./model-capability-registry";
import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";
import {
  ProviderAdapterRegistry,
  type ProviderAdapter,
} from "./provider-adapters";
import {
  ResilientModelExecutionAuthority,
} from "./resilient-model-execution";
import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

class FakeAdapter implements ProviderAdapter {
  readonly descriptor;
  readonly calls: string[] = [];
  private readonly intelligenceModel: IntelligenceModel;

  constructor(
    readonly identity: ModelIdentity,
    private readonly executeResult: (
      request: ModelExecutionRequest,
    ) => ModelExecutionResult,
  ) {
    this.descriptor = {
      id: identity.providerId,
      name: identity.providerId,
      kind: identity.providerKind,
      available: true,
    };
    this.intelligenceModel = {
      identity,
      canHandle: () => true,
      execute: async (request) => this.executeResult(request),
    };
  }

  listModels(): readonly ModelIdentity[] {
    return [this.identity];
  }

  getModel(modelId: string): IntelligenceModel | undefined {
    return modelId === this.identity.modelId
      ? this.intelligenceModel
      : undefined;
  }

  async execute(
    modelId: string,
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    this.calls.push(modelId);
    if (modelId !== this.identity.modelId) {
      return failure(
        request,
        this.identity.providerId,
        modelId,
        "MODEL_NOT_FOUND",
      );
    }
    return this.executeResult(request);
  }
}

function identity(
  providerId: string,
  modelId: string,
  internal: boolean,
  contextWindowTokens: number,
  supportsToolCalling: boolean,
): ModelIdentity {
  return {
    providerId,
    modelId,
    displayName: modelId,
    providerKind: internal ? "internal-local" : "external-routed",
    capabilities: [
      "reasoning",
      "coding",
      "tool-use",
      "verification",
    ],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens,
    supportsToolCalling,
    supportsStructuredOutput: true,
    available: true,
  };
}

function success(
  request: ModelExecutionRequest,
  model: ModelIdentity,
  content: string,
  reportedCostUsd: number,
): ModelExecutionResult {
  const startedAt = "2026-09-05T08:00:00.000Z";
  const completedAt = "2026-09-05T08:00:00.100Z";
  return {
    success: true,
    response: {
      requestId: request.id,
      model,
      content,
      toolCallProposals: [],
      usage: {
        elapsedMs: 100,
        tokensUsed: 18,
        iterationsUsed: 1,
        estimatedCost: reportedCostUsd,
        inputTokens: 12,
        outputTokens: 6,
        reportedCostUsd,
      },
      metadata: {
        requestId: request.id,
        startedAt,
        completedAt,
        latencyMs: 100,
      },
    },
  };
}

function failure(
  request: ModelExecutionRequest,
  providerId: string,
  modelId: string,
  code: string,
): ModelExecutionResult {
  const timestamp = "2026-09-05T08:00:00.000Z";
  return {
    success: false,
    failure: {
      requestId: request.id,
      providerId,
      modelId,
      retryable: true,
      code,
      message: `${providerId}/${modelId} failed for acceptance testing.`,
      metadata: {
        requestId: request.id,
        startedAt: timestamp,
        completedAt: timestamp,
        latencyMs: 50,
      },
    },
  };
}

function registerCapabilities(
  registry: ModelCapabilityRegistry,
  model: ModelIdentity,
  strength: number,
): void {
  registry.register({
    model,
    capabilities: model.capabilities.map((capability) => ({
      capability,
      strength,
      status: "verified" as const,
      evidenceReferences: [
        `acceptance:${model.providerId}/${model.modelId}`,
      ],
      verifiedAt: "2026-09-05T08:00:00.000Z",
    })),
  });
}

async function main(): Promise<void> {
  const localModel = identity(
    "ollama-local",
    "qwen-local",
    true,
    16_384,
    false,
  );
  const cloudModel = identity(
    "omniroute",
    "auto/coding",
    false,
    128_000,
    true,
  );

  const local = new FakeAdapter(
    localModel,
    (request) => failure(
      request,
      localModel.providerId,
      localModel.modelId,
      "LOCAL_MODEL_BUSY",
    ),
  );
  const cloud = new FakeAdapter(
    cloudModel,
    (request) => success(
      request,
      cloudModel,
      "verified cloud completion",
      0.02,
    ),
  );

  const providers = new ProviderAdapterRegistry();
  providers.register(local);
  providers.register(cloud);

  const capabilities = new ModelCapabilityRegistry();
  registerCapabilities(capabilities, localModel, 86);
  registerCapabilities(capabilities, cloudModel, 97);

  const metrics = new Map<string, ModelRoutingMetrics>([
    [
      modelRoutingMetricKey(localModel.providerId, localModel.modelId),
      {
        estimatedCost: 0,
        costBasis: "verified-free",
        latencyMs: 600,
        reliability: 90,
      },
    ],
    [
      modelRoutingMetricKey(cloudModel.providerId, cloudModel.modelId),
      {
        estimatedCost: 0.02,
        costBasis: "provider-reported",
        latencyMs: 200,
        reliability: 99,
      },
    ],
  ]);

  const router = new AppMegaRouter(
    new ModelRouter(capabilities, metrics),
    new ResilientModelExecutionAuthority(
      providers,
      {
        failureThreshold: 1,
        cooldownMs: 30_000,
        maximumAttempts: 4,
        now: () => Date.parse("2026-09-05T08:00:00.000Z"),
      },
    ),
  );

  const economy = await router.route({
    appId: "authors.forge",
    requestId: "route-economy",
    messages: [
      {
        role: "user",
        content: "Implement a verified TypeScript change.",
      },
    ],
    requiredCapabilities: ["reasoning", "coding"],
    costPreference: "economy",
  });

  assert(economy.success, "Economy routing must fail over to a working model.");
  if (!economy.success) return;
  assert(
    economy.candidates[0]?.providerId === localModel.providerId,
    "Economy routing must prefer the verified zero-marginal-cost local route.",
  );
  assert(
    economy.attempts.length === 2 &&
      economy.attempts[0]?.providerId === localModel.providerId &&
      economy.attempts[0]?.success === false &&
      economy.attempts[1]?.providerId === cloudModel.providerId &&
      economy.attempts[1]?.success === true,
    "Economy routing must preserve transparent local-to-cloud failover evidence.",
  );
  assert(
    economy.providerId === cloudModel.providerId &&
      economy.content === "verified cloud completion",
    "The successful fallback model must be reported as the actual executor.",
  );
  assert(
    economy.context.requiredContextTokens >= economy.context.estimatedInputTokens,
    "The app router must expose its conservative context-capacity evidence.",
  );

  console.log("001.MEGA-ROUTER economy-first resilient failover: SUCCESS");

  const quality = await router.route({
    appId: "authors.forge",
    requestId: "route-quality",
    messages: [
      {
        role: "user",
        content: "Prefer the strongest verified route.",
      },
    ],
    requiredCapabilities: ["reasoning", "coding"],
    costPreference: "quality",
  });

  assert(quality.success, "Quality routing must find a verified route.");
  if (!quality.success) return;
  assert(
    quality.candidates[0]?.providerId === cloudModel.providerId &&
      quality.attempts.length === 1,
    "Quality routing must rank capability and reliability ahead of price.",
  );

  console.log("002.MEGA-ROUTER quality-first routing: SUCCESS");

  const longContext = await router.route({
    appId: "kings.collectors",
    requestId: "route-long-context",
    messages: [
      {
        role: "user",
        content: "Analyze the collection corpus.",
      },
    ],
    requiredCapabilities: ["reasoning"],
    minimumContextTokens: 50_000,
    costPreference: "economy",
  });

  assert(longContext.success, "Long-context routing must select a capable model.");
  if (!longContext.success) return;
  assert(
    longContext.candidates.every((candidate) =>
      (candidate.contextWindowTokens ?? 0) >= 50_000,
    ),
    "Models below the required context window must be excluded before execution.",
  );
  assert(
    longContext.providerId === cloudModel.providerId,
    "The 16K local model must not receive a request requiring 50K context.",
  );

  console.log("003.MEGA-ROUTER context-window enforcement: SUCCESS");

  const tools = await router.route({
    appId: "authors.forge",
    requestId: "route-tools",
    messages: [
      {
        role: "user",
        content: "Propose a repository inspection tool call.",
      },
    ],
    requiredCapabilities: ["reasoning", "tool-use"],
    allowToolProposals: true,
    toolDefinitions: [
      {
        toolId: "repository.inspect",
        description: "Read governed repository context.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
    ],
    costPreference: "economy",
  });

  assert(tools.success, "Tool-proposal routing must select a tool-capable model.");
  if (!tools.success) return;
  assert(
    tools.candidates.every((candidate) => candidate.providerId !== localModel.providerId),
    "A model without tool-calling support must not receive tool-proposal work.",
  );

  console.log("004.MEGA-ROUTER tool-capability enforcement: SUCCESS");

  const denied = await router.route({
    appId: "authors.forge",
    requestId: "route-denied",
    messages: [
      {
        role: "user",
        content: "This request must fail closed.",
      },
    ],
    requiredCapabilities: ["reasoning"],
    deniedProviderIds: [
      localModel.providerId,
      cloudModel.providerId,
    ],
  });

  assert(
    !denied.success &&
      denied.code === "NO_ROUTABLE_MODEL" &&
      denied.attempts.length === 0,
    "Provider policy must fail closed before any denied route executes.",
  );

  console.log("005.MEGA-ROUTER provider-policy fail-closed: SUCCESS");
  console.log("APP-MEGA-ROUTER V1: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
