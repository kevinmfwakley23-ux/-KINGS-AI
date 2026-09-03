import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import { ProviderAdapterRegistry, type ProviderAdapter } from "./provider-adapters";
import { AdaptiveModelExecutionCoordinator } from "./adaptive-model-execution";
import type { ModelRoutingMetrics } from "./model-routing";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const primaryIdentity: ModelIdentity = {
  providerId: "provider-primary",
  modelId: "model-primary",
  displayName: "Primary Local Coder",
  providerKind: "internal-local",
  capabilities: ["coding"],
  inputModalities: ["text"],
  outputModalities: ["text"],
  contextWindowTokens: 32_000,
  supportsToolCalling: true,
  supportsStructuredOutput: true,
  available: true,
};

const fallbackIdentity: ModelIdentity = {
  providerId: "provider-fallback",
  modelId: "model-fallback",
  displayName: "Fallback Free Coder",
  providerKind: "external-free",
  capabilities: ["coding"],
  inputModalities: ["text"],
  outputModalities: ["text"],
  contextWindowTokens: 64_000,
  supportsToolCalling: true,
  supportsStructuredOutput: true,
  available: true,
};

class TestProvider implements ProviderAdapter {
  readonly descriptor;

  constructor(
    readonly identity: ModelIdentity,
    private readonly execution: (request: ModelExecutionRequest) => ModelExecutionResult,
  ) {
    this.descriptor = {
      id: identity.providerId,
      name: identity.displayName,
      kind: identity.providerKind,
      available: true,
    };
  }

  listModels(): readonly ModelIdentity[] {
    return [this.identity];
  }

  getModel(_modelId: string): IntelligenceModel | undefined {
    return undefined;
  }

  async execute(_modelId: string, request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    return this.execution(request);
  }
}

const capabilityRegistry = new ModelCapabilityRegistry();
capabilityRegistry.register({
  model: primaryIdentity,
  capabilities: [{
    capability: "coding",
    strength: 96,
    status: "verified",
    evidenceReferences: ["primary-coding-proof"],
    verifiedAt: "2026-09-02T00:00:00.000Z",
  }],
});
capabilityRegistry.register({
  model: fallbackIdentity,
  capabilities: [{
    capability: "coding",
    strength: 90,
    status: "verified",
    evidenceReferences: ["fallback-coding-proof"],
    verifiedAt: "2026-09-02T00:00:00.000Z",
  }],
});

const providers = new ProviderAdapterRegistry();
providers.register(new TestProvider(primaryIdentity, (request) => ({
  success: false,
  failure: {
    requestId: request.id,
    providerId: primaryIdentity.providerId,
    modelId: primaryIdentity.modelId,
    retryable: true,
    code: "TEMPORARY_CAPACITY",
    message: "Primary model temporarily unavailable.",
    metadata: {
      requestId: request.id,
      startedAt: "2026-09-02T00:00:00.000Z",
      completedAt: "2026-09-02T00:00:00.100Z",
      latencyMs: 100,
    },
  },
})));
providers.register(new TestProvider(fallbackIdentity, (request) => ({
  success: true,
  response: {
    requestId: request.id,
    model: fallbackIdentity,
    content: "Verified fallback completion.",
    toolCallProposals: [],
    usage: {
      elapsedMs: 200,
      tokensUsed: 120,
      iterationsUsed: 1,
      estimatedCost: 0,
      inputTokens: 80,
      outputTokens: 40,
    },
    metadata: {
      requestId: request.id,
      startedAt: "2026-09-02T00:00:00.100Z",
      completedAt: "2026-09-02T00:00:00.300Z",
      latencyMs: 200,
    },
  },
})));

const metrics: ReadonlyMap<string, ModelRoutingMetrics> = new Map([
  [primaryIdentity.modelId, {
    estimatedCost: 0,
    latencyMs: 300,
    reliability: 98,
    tokensPerSecond: 25,
    quotaRemainingRatio: 1,
  }],
  [fallbackIdentity.modelId, {
    estimatedCost: 0,
    latencyMs: 500,
    reliability: 92,
    tokensPerSecond: 20,
    quotaRemainingRatio: 1,
  }],
]);

const request: ModelExecutionRequest = {
  id: "adaptive-execution-request",
  taskId: "task-adaptive-routing",
  missionId: "mission-adaptive-routing",
  messages: [{ role: "user", content: "Produce a bounded coding result." }],
  requiredCapabilities: ["coding"],
  inputModalities: ["text"],
  outputModality: "text",
  maxOutputTokens: 512,
  requireStructuredOutput: false,
  allowToolProposals: false,
};

async function main(): Promise<void> {
  const coordinator = new AdaptiveModelExecutionCoordinator(
    capabilityRegistry,
    metrics,
    providers,
  );

  const result = await coordinator.execute({
    routing: {
      requiredCapabilities: ["coding"],
      mode: "coding",
      preferInternal: true,
      fallbackLimit: 2,
    },
    execution: request,
    nowEpochMs: 1_000,
  });

  assert(result.routing.modelId === primaryIdentity.modelId, "Primary route was not selected before execution.");
  assert(result.execution.result.success, "Retryable primary failure did not recover through the governed fallback chain.");
  assert(result.execution.result.response?.model.modelId === fallbackIdentity.modelId, "Fallback execution did not preserve the actual responding model identity.");
  assert(result.execution.usedFallback, "Fallback use was not recorded.");
  assert(result.execution.attempts.length === 2, "Execution did not preserve both provider attempts as evidence.");
  assert(result.execution.attempts[0].code === "TEMPORARY_CAPACITY", "Primary failure code was not preserved.");

  const primaryRuntime = coordinator.routingTelemetry().get(primaryIdentity.modelId);
  const fallbackRuntime = coordinator.routingTelemetry().get(fallbackIdentity.modelId);
  assert(primaryRuntime?.recentFailureCount === 1, "Primary runtime failure was not learned.");
  assert(fallbackRuntime?.recentFailureCount === 0, "Successful fallback was incorrectly marked failed.");
  assert(fallbackRuntime?.lastSuccessEpochMs === 1_000, "Fallback last-known-good state was not recorded.");

  console.log("Adaptive route selection: SUCCESS");
  console.log("Retryable governed fallback execution: SUCCESS");
  console.log("Provider attempt evidence preservation: SUCCESS");
  console.log("Runtime health learning: SUCCESS");
  console.log("TREE-04 ADAPTIVE MODEL EXECUTION: SUCCESS");
}

main().catch((error: unknown) => {
  console.error("=== K.I.N.G.S. ADAPTIVE MODEL EXECUTION TEST FAILED ===");
  console.error(error);
  process.exitCode = 1;
});
