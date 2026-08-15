import {
  ModelDrivenMissionExecutor,
} from "./model-driven-mission-executor";

import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";

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

const identity:
  ModelIdentity =
  {
    providerId:
      "internal-test",

    modelId:
      "kings-test-intelligence",

    displayName:
      "K.I.N.G.S. Test Intelligence",

    providerKind:
      "internal-local",

    capabilities: [
      "reasoning",
      "planning",
      "coding",
      "debugging",
      "verification",
    ],

    inputModalities: [
      "text",
    ],

    outputModalities: [
      "text",
    ],

    contextWindowTokens:
      8192,

    supportsToolCalling:
      false,

    supportsStructuredOutput:
      false,

    available:
      true,
  };

const model:
  IntelligenceModel =
  {
    identity,

    canHandle(
      request:
        ModelExecutionRequest,
    ):
      boolean {
      return request.requiredCapabilities.every(
        (
          capability,
        ) =>
          identity.capabilities.includes(
            capability,
          ),
      );
    },

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
            identity,

          content:
            [
              "1. Inspect the repository.",
              "2. Identify the smallest authorized code change.",
              "3. Build the change.",
              "4. Run verification.",
              "5. Preserve evidence and continue the mission.",
            ].join(
              "\n",
            ),

          toolCallProposals:
            [],

          usage: {
            elapsedMs:
              1,

            tokensUsed:
              20,

            iterationsUsed:
              1,

            inputTokens:
              10,

            outputTokens:
              10,

            estimatedCost:
              0,
          },

          metadata: {
            requestId:
              request.id,

            startedAt:
              new Date().toISOString(),

            completedAt:
              new Date().toISOString(),

            latencyMs:
              1,
          },
        },
      };
    },
  };

async function main(): Promise<void> {
  const executor =
    new ModelDrivenMissionExecutor();

  const result =
    await executor.execute({
      id:
        "mission-execution-proof",

      taskId:
        "mission-task-proof",

      missionId:
        "mission-proof",

      objective:
        "Build a small software feature and verify it.",

      context:
        [
          "Project: K.I.N.G.S.",
          "Workspace: controlled local repository.",
          "The worker must remain within authorization.",
        ].join(
          "\n",
        ),

      requiredCapabilities: [
        "reasoning",
        "planning",
      ],

      model,
    });

  assert(
    result.success,
    result.failureReason ??
      "Model-driven mission execution failed.",
  );

  assert(
    result.reasoning.includes(
      "Inspect the repository",
    ),
    "Mission reasoning was not preserved.",
  );

  assert(
    result.evidence.includes(
      "model-execution:passed",
    ),
    "Model execution evidence missing.",
  );

  assert(
    !result.completed,
    "Planning/reasoning must not falsely declare mission completion.",
  );

  console.log(
    "001.MODEL-DRIVEN MISSION → CAPABILITY CHECK: SUCCESS",
  );

  console.log(
    "002.MODEL-DRIVEN MISSION → INTERNAL INTELLIGENCE EXECUTION: SUCCESS",
  );

  console.log(
    "003.MODEL-DRIVEN MISSION → REASONING + EVIDENCE: SUCCESS",
  );

  console.log(
    "004.MODEL-DRIVEN MISSION → COMPLETION AUTHORITY PRESERVED: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. MODEL-DRIVEN MISSION EXECUTOR: SUCCESS",
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
