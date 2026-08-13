import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

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
      "internal-test-model",
    displayName:
      "K.I.N.G.S. Internal Test Intelligence",
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
          "internal-execution-success",
        toolCallProposals: [],
        usage: {
          elapsedMs:
            1,
          tokensUsed:
            5,
          iterationsUsed:
            1,
          inputTokens:
            3,
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
  let executorCalls =
    0;

  const adapter =
    new GovernedInternalIntelligenceAdapter(
      {
        async execute(
          model,
          request,
        ) {
          executorCalls +=
            1;

          return {
            success:
              true,
            response: {
              requestId:
                request.id,
              model,
              content:
                "governed-internal-success",
              toolCallProposals: [],
              usage: {
                elapsedMs:
                  1,
                tokensUsed:
                  4,
                iterationsUsed:
                  1,
                inputTokens:
                  2,
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
        },
      },
    );

  const model =
    new TestInternalModel();

  adapter.registerModel(
    model,
  );

  assert(
    adapter.listModels().length ===
      1,
    "Internal model registration failed.",
  );

  console.log(
    "04.INTERNAL model registration: SUCCESS",
  );

  const request:
    ModelExecutionRequest = {
    id:
      "internal-request-001",
    taskId:
      "task-internal-001",
    missionId:
      "mission-internal-001",
    messages: [
      {
        role:
          "user",
        content:
          "Perform a bounded internal intelligence task.",
      },
    ],
    requiredCapabilities: [
      "coding",
      "reasoning",
    ],
    inputModalities: [
      "text",
    ],
    outputModality:
      "text",
    allowToolProposals:
      false,
  };

  const success =
    await adapter.execute(
      model.identity.modelId,
      request,
    );

  assert(
    success.success,
    "Governed internal execution failed.",
  );

  assert(
    executorCalls ===
      1,
    "Internal execution did not cross the governed executor boundary exactly once.",
  );

  console.log(
    "04.INTERNAL governed execution: SUCCESS",
  );

  const unavailable =
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
                "unused",
              toolCallProposals: [],
              usage: {
                elapsedMs:
                  1,
                tokensUsed:
                  1,
                iterationsUsed:
                  1,
                inputTokens:
                  0,
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

  const unavailableModel =
    new TestInternalModel();

  unavailableModel.identity.available =
    false;

  unavailable.registerModel(
    unavailableModel,
  );

  const unavailableResult =
    await unavailable.execute(
      unavailableModel.identity.modelId,
      request,
    );

  assert(
    unavailableResult.success ===
      false &&
    unavailableResult.failure?.code ===
      "INTERNAL_MODEL_UNAVAILABLE",
    "Unavailable internal model was not blocked.",
  );

  console.log(
    "04.INTERNAL unavailable-model protection: SUCCESS",
  );

  const mismatchRequest:
    ModelExecutionRequest = {
    ...request,
    id:
      "internal-request-mismatch",
    requiredCapabilities: [
      "vision",
    ],
  };

  const mismatch =
    await adapter.execute(
      model.identity.modelId,
      mismatchRequest,
    );

  assert(
    mismatch.success ===
      false &&
    mismatch.failure?.code ===
      "INTERNAL_MODEL_CAPABILITY_MISMATCH",
    "Capability mismatch was not blocked.",
  );

  console.log(
    "04.INTERNAL capability-boundary protection: SUCCESS",
  );

  const missing =
    await adapter.execute(
      "missing-internal-model",
      request,
    );

  assert(
    missing.success ===
      false &&
    missing.failure?.code ===
      "INTERNAL_MODEL_NOT_REGISTERED",
    "Missing internal model was not handled deterministically.",
  );

  console.log(
    "04.INTERNAL missing-model protection: SUCCESS",
  );

  console.log(
    "TREE-04 INTERNAL INTELLIGENCE ADAPTER: SUCCESS",
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
