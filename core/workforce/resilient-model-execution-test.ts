import type {
  ID,
} from "./types";

import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "./provider-adapters";

import {
  ProviderAdapterRegistry,
} from "./provider-adapters";

import type {
  ModelRoutingCandidate,
} from "./model-routing";

import {
  ResilientModelExecutionAuthority,
} from "./resilient-model-execution";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function request(): ModelExecutionRequest {
  return {
    id: "resilient-request",
    taskId: "resilient-task",
    missionId: "resilient-mission",
    messages: [
      {
        role: "user",
        content: "Build working code.",
      },
    ],
    requiredCapabilities: ["coding"],
    inputModalities: ["text"],
    outputModality: "text",
    allowToolProposals: false,
  };
}

class RouteProvider
  implements ProviderAdapter
{
  readonly descriptor: ProviderDescriptor;

  private calls = 0;

  constructor(
    id: string,
    private readonly results: ModelExecutionResult[],
  ) {
    this.descriptor = {
      id,
      name: id,
      kind: "external-free",
      available: true,
    };
  }

  listModels() {
    return [];
  }

  getModel(
    _modelId: ID,
  ): IntelligenceModel | undefined {
    return undefined;
  }

  async execute(
    modelId: ID,
    executionRequest: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    const selected =
      this.results[Math.min(this.calls, this.results.length - 1)];
    this.calls += 1;

    if (selected.success && selected.response) {
      return {
        success: true,
        response: {
          ...selected.response,
          requestId: executionRequest.id,
          model: {
            ...selected.response.model,
            providerId: this.descriptor.id,
            modelId,
          },
          metadata: {
            ...selected.response.metadata,
            requestId: executionRequest.id,
          },
        },
      };
    }

    return {
      success: false,
      failure: {
        requestId: executionRequest.id,
        providerId: this.descriptor.id,
        modelId,
        retryable: selected.failure?.retryable ?? true,
        code: selected.failure?.code ?? "TEST_FAILURE",
        message: selected.failure?.message ?? "test failure",
        metadata: {
          requestId: executionRequest.id,
          startedAt: "2026-09-02T00:00:00.000Z",
          completedAt: "2026-09-02T00:00:00.001Z",
          latencyMs: 1,
        },
      },
    };
  }

  get callCount(): number {
    return this.calls;
  }
}

function failure(
  code: string,
  retryable = true,
): ModelExecutionResult {
  return {
    success: false,
    failure: {
      requestId: "x",
      providerId: "x",
      modelId: "x",
      retryable,
      code,
      message: code,
      metadata: {
        requestId: "x",
        startedAt: "2026-09-02T00:00:00.000Z",
        completedAt: "2026-09-02T00:00:00.001Z",
        latencyMs: 1,
      },
    },
  };
}

function success(): ModelExecutionResult {
  return {
    success: true,
    response: {
      requestId: "x",
      model: {
        providerId: "x",
        modelId: "x",
        displayName: "x",
        providerKind: "external-free",
        capabilities: ["coding"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: 32_000,
        supportsToolCalling: false,
        supportsStructuredOutput: false,
        available: true,
      },
      content: "FILE: src/green.ts [create]\nexport const green = true;",
      toolCallProposals: [],
      usage: {
        elapsedMs: 1,
        tokensUsed: 10,
        iterationsUsed: 1,
        inputTokens: 5,
        outputTokens: 5,
      },
      metadata: {
        requestId: "x",
        startedAt: "2026-09-02T00:00:00.000Z",
        completedAt: "2026-09-02T00:00:00.001Z",
        latencyMs: 1,
      },
    },
  };
}

function candidate(
  providerId: string,
  modelId: string,
  rank: number,
): ModelRoutingCandidate {
  return {
    providerId,
    modelId,
    capabilityStrength: 90 - rank,
    estimatedCost: rank,
    costBasis: "configured-estimate",
    latencyMs: 100 + rank,
    reliability: 90 - rank,
    internal: false,
  };
}

async function runTest(): Promise<void> {
  const registry = new ProviderAdapterRegistry();
  const primary = new RouteProvider(
    "omniroute-local",
    [failure("GATEWAY_HTTP_429")],
  );
  const fallback = new RouteProvider(
    "9router-local",
    [success()],
  );

  registry.register(primary);
  registry.register(fallback);

  let now = 1_000;
  const authority = new ResilientModelExecutionAuthority(
    registry,
    {
      failureThreshold: 1,
      cooldownMs: 10_000,
      maximumAttempts: 4,
      now: () => now,
    },
  );

  const candidates = [
    candidate("omniroute-local", "auto/coding", 0),
    candidate("9router-local", "combo-coding", 1),
  ];

  const first = await authority.execute(
    candidates,
    request(),
  );

  assert(first.result.success, "Fallback route did not recover execution.");
  assert(
    first.providerId === "9router-local",
    "Successful fallback provider was not reported.",
  );
  assert(
    first.attempts.length === 2,
    "Primary failure and fallback success were not both recorded.",
  );
  assert(
    first.attempts[0].failureCode === "GATEWAY_HTTP_429",
    "Primary quota failure was not preserved.",
  );

  console.log("RESILIENCE-001 quota failure falls through to next gateway: SUCCESS");

  const circuit = authority.getCircuitState(
    "omniroute-local",
    "auto/coding",
  );
  assert(
    circuit?.cooldownUntil === 11_000,
    "Circuit breaker did not open after threshold failure.",
  );

  const second = await authority.execute(
    candidates,
    request(),
  );

  assert(second.result.success, "Fallback should remain available during cooldown.");
  assert(
    second.attempts[0].skipped &&
    second.attempts[0].failureCode === "ROUTE_COOLDOWN",
    "Cooling route was not skipped.",
  );
  assert(
    primary.callCount === 1,
    "Cooling route should not receive another provider request.",
  );

  console.log("RESILIENCE-002 circuit-breaker cooldown: SUCCESS");

  now = 12_000;
  const third = await authority.execute(
    candidates,
    request(),
  );
  assert(
    primary.callCount === 2,
    "Route was not retried after cooldown expired.",
  );
  assert(
    third.result.success,
    "Fallback after expired circuit retry should still succeed.",
  );

  console.log("RESILIENCE-003 cooled route becomes eligible again: SUCCESS");

  const empty = await authority.execute([], request());
  assert(!empty.result.success, "Empty route list must fail safely.");
  assert(
    empty.result.failure?.code === "NO_EXECUTABLE_MODEL_ROUTE",
    "Empty route list did not return governed routing failure.",
  );

  console.log("RESILIENCE-004 no-route failure: SUCCESS");
  console.log("K.I.N.G.S. RESILIENT MODEL EXECUTION: SUCCESS");
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
