import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  IntelligenceModel,
} from "./model-interface";

import {
  ProviderAdapterRegistry,
} from "./provider-adapters";

import {
  GovernedInternalIntelligenceAdapter,
} from "./internal-intelligence-adapter";

import {
  InternalModelExecutionPort,
} from "./internal-model-execution-port";

import {
  ModelCapabilityRegistry,
} from "./model-capability-registry";

import {
  ModelRouter,
} from "./model-routing";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

class TestInternalModel
  implements IntelligenceModel {
  readonly identity = {
    providerId:
      "internal-intelligence",
    modelId:
      "internal-worker-model",
    displayName:
      "K.I.N.G.S. Internal Worker Model",
    providerKind:
      "internal-local" as const,
    capabilities: [
      "reasoning",
      "coding",
      "debugging",
      "research",
      "source-inspection",
      "tool-use",
      "verification",
      "recovery",
    ] as const,
    inputModalities: [
      "text",
    ] as const,
    outputModalities: [
      "text",
    ] as const,
    contextWindowTokens:
      32768,
    supportsToolCalling:
      true,
    supportsStructuredOutput:
      true,
    available:
      true,
  };

  canHandle(
    request:
      ModelExecutionRequest,
  ):
    boolean {
    const capabilities =
      new Set<string>(
        this.identity.capabilities,
      );

    return request.requiredCapabilities.every(
      (required) =>
        capabilities.has(
          required,
        ),
    );
  }

  async execute(
    request:
      ModelExecutionRequest,
  ):
    Promise<
      ModelExecutionResult
    > {
    return {
      success:
        true,
      response: {
        requestId:
          request.id,
        model:
          this.identity,
        content:
          "real bounded internal worker execution",
        toolCallProposals: [],
        usage: {
          elapsedMs:
            2,
          tokensUsed:
            6,
          iterationsUsed:
            1,
          inputTokens:
            3,
          outputTokens:
            3,
          estimatedCost:
            0,
        },
        metadata: {
          requestId:
            request.id,
          startedAt:
            "2026-08-13T00:00:00.000Z",
          completedAt:
            "2026-08-13T00:00:00.002Z",
          latencyMs:
            2,
        },
      },
    };
  }
}

async function main(): Promise<void> {
  const model =
    new TestInternalModel();

  const adapter =
    new GovernedInternalIntelligenceAdapter(
      {
        async execute(
          identity,
          request,
        ) {
          return model.execute(
            request,
          );
        },
      },
    );

  adapter.registerModel(
    model,
  );

  const providers =
    new ProviderAdapterRegistry();

  providers.register(
    adapter,
  );

  const capabilities =
    new ModelCapabilityRegistry();

  capabilities.register({
    model:
      model.identity,
    capabilities: [
      {
        capability:
          "reasoning",
        strength:
          90,
        status:
          "verified",
        evidenceReferences: [
          "internal-worker-loop",
        ],
        verifiedAt:
          "2026-08-13T00:00:00.000Z",
      },
      {
        capability:
          "coding",
        strength:
          85,
        status:
          "verified",
        evidenceReferences: [
          "internal-worker-loop",
        ],
        verifiedAt:
          "2026-08-13T00:00:00.000Z",
      },
    ],
  });

  const router =
    new ModelRouter(
      capabilities,
      new Map([
        [
          model.identity.modelId,
          {
            estimatedCost:
              0,
            latencyMs:
              2,
            reliability:
              95,
          },
        ],
      ]),
    );

  const decision =
    router.route({
      requiredCapabilities: [
        "reasoning",
        "coding",
      ],
      preferInternal:
        true,
    });

  assert(
    decision.selected,
    "Internal model must be selected.",
  );

  const requests =
    new Map<
      string,
      {
        request:
          ModelExecutionRequest;
        target: {
          providerId:
            string;
          modelId:
            string;
        };
      }
    >();

  requests.set(
    "task-internal-worker-001",
    {
      request: {
        id:
          "model-request-worker-001",
        taskId:
          "task-internal-worker-001",
        missionId:
          "mission-internal-worker-001",
        messages: [
          {
            role:
              "user",
            content:
              "Perform a bounded software-engineering work unit.",
          },
        ],
        requiredCapabilities: [
          "reasoning",
          "coding",
        ],
        inputModalities: [
          "text",
        ],
        outputModality:
          "text",
        allowToolProposals:
          false,
      },
      target: {
        providerId:
          decision.providerId!,
        modelId:
          decision.modelId!,
      },
    },
  );

  const port =
    new InternalModelExecutionPort(
      providers,
      requests,
    );

  const result =
    await port.execute(
      "task-internal-worker-001",
    );

  assert(
    result.status ===
      "success",
    "Internal model must produce a worker execution result.",
  );

  assert(
    result.agentId ===
      "internal-intelligence",
    "Worker result must remain attributable to internal intelligence.",
  );

  assert(
    result.summary.includes(
      "real bounded internal worker execution",
    ),
    "Internal model response did not reach the worker execution port.",
  );

  assert(
    result.usage?.estimatedCost ===
      0,
    "Internal worker execution must report zero external provider cost in this test.",
  );

  console.log(
    "04.WORKER internal model routing: SUCCESS",
  );

  console.log(
    "04.WORKER provider-registry execution: SUCCESS",
  );

  console.log(
    "04.WORKER execution-port bridge: SUCCESS",
  );

  console.log(
    "04.WORKER attributable internal execution: SUCCESS",
  );

  console.log(
    "04.WORKER zero external-provider cost path: SUCCESS",
  );

  console.log(
    "TREE-04 INTERNAL MODEL → WORKER EXECUTION BRIDGE: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
