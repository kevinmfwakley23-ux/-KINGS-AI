import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import {
  ModelCapabilityRegistry,
} from "./model-capability-registry";

import {
  ModelRouter,
} from "./model-routing";

import {
  ProviderAdapterRegistry,
} from "./provider-adapters";

import {
  GovernedInternalIntelligenceAdapter,
} from "./internal-intelligence-adapter";

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
      "internal-routing-model",
    displayName:
      "K.I.N.G.S. Internal Routing Model",
    providerKind:
      "internal-local" as const,
    capabilities: [
      "reasoning",
      "planning",
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
          "internal-router-success",
        toolCallProposals: [],
        usage: {
          elapsedMs:
            1,
          tokensUsed:
            3,
          iterationsUsed:
            1,
          inputTokens:
            1,
          outputTokens:
            2,
          estimatedCost:
            0,
        },
        metadata: {
          requestId:
            request.id,
          startedAt:
            "2026-08-13T00:00:00.000Z",
          completedAt:
            "2026-08-13T00:00:00.001Z",
          latencyMs:
            1,
        },
      },
    };
  }
}

async function main(): Promise<void> {
  const providerRegistry =
    new ProviderAdapterRegistry();

  const internalAdapter =
    new GovernedInternalIntelligenceAdapter(
      {
        async execute(
          model,
          request,
        ) {
          return {
            success:
              true,
            response: {
              requestId:
                request.id,
              model,
              content:
                "internal-provider-success",
              toolCallProposals: [],
              usage: {
                elapsedMs:
                  1,
                tokensUsed:
                  2,
                iterationsUsed:
                  1,
                inputTokens:
                  1,
                outputTokens:
                  1,
                estimatedCost:
                  0,
              },
              metadata: {
                requestId:
                  request.id,
                startedAt:
                  "2026-08-13T00:00:00.000Z",
                completedAt:
                  "2026-08-13T00:00:00.001Z",
                latencyMs:
                  1,
              },
            },
          };
        },
      },
    );

  const model =
    new TestInternalModel();

  internalAdapter.registerModel(
    model,
  );

  providerRegistry.register(
    internalAdapter,
  );

  assert(
    providerRegistry
      .listAvailable()
      .some(
        (provider) =>
          provider.id ===
          "internal-intelligence",
      ),
    "Internal provider was not registered as available.",
  );

  console.log(
    "04.ROUTING internal provider registration: SUCCESS",
  );

  const capabilityRegistry =
    new ModelCapabilityRegistry();

  capabilityRegistry.register({
    model:
      model.identity,
    capabilities:
      [
        {
          capability:
            "reasoning",
          strength:
            90,
          status:
            "verified",
          evidenceReferences: [
            "internal-routing-test",
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
            "internal-routing-test",
          ],
          verifiedAt:
            "2026-08-13T00:00:00.000Z",
        },
      ],
  });

  const router =
    new ModelRouter(
      capabilityRegistry,
      new Map([
        [
          model.identity.modelId,
          {
            estimatedCost:
              0,
            latencyMs:
              1,
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
    "Internal model was not selected by the existing router.",
  );

  assert(
    decision.modelId ===
      model.identity.modelId,
    "Router selected the wrong internal model.",
  );

  assert(
    decision.providerId ===
      "internal-intelligence",
    "Router selected the wrong internal provider.",
  );

  console.log(
    "04.ROUTING internal capability discovery: SUCCESS",
  );

  console.log(
    "04.ROUTING internal preference: SUCCESS",
  );

  const routed =
    await providerRegistry.execute(
      decision.providerId!,
      decision.modelId!,
      {
        id:
          "internal-route-request",
        taskId:
          "task-internal-route",
        missionId:
          "mission-internal-route",
        messages: [
          {
            role:
              "user",
            content:
              "Perform bounded internal coding work.",
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
    );

  assert(
    routed.success,
    "Routed internal model execution failed.",
  );

  assert(
    routed.response?.model.providerKind ===
      "internal-local",
    "Execution did not remain on the internal intelligence provider.",
  );

  console.log(
    "04.ROUTING internal execution through provider registry: SUCCESS",
  );

  console.log(
    "TREE-04 INTERNAL INTELLIGENCE ROUTING: SUCCESS",
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
