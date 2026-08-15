import type {
  ID,
} from "./types";

import type {
  IntelligenceCapability,
  IntelligenceModality,
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import type {
  IntelligenceModel,
} from "./model-interface";

export interface ModelDrivenMissionRequest {
  id:
    ID;

  taskId:
    ID;

  missionId:
    ID;

  objective:
    string;

  context:
    string;

  requiredCapabilities:
    readonly IntelligenceCapability[];

  model:
    IntelligenceModel;

  maxOutputTokens?:
    number;

  temperature?:
    number;
}

export interface ModelDrivenMissionResult {
  success:
    boolean;

  request:
    ModelExecutionRequest;

  modelResult:
    ModelExecutionResult;

  reasoning:
    string;

  completed:
    boolean;

  evidence:
    readonly string[];

  failureReason?:
    string;
}

export class ModelDrivenMissionExecutor {
  async execute(
    input:
      ModelDrivenMissionRequest,
  ):
    Promise<
      ModelDrivenMissionResult
    > {
    const request:
      ModelExecutionRequest =
      {
        id:
          input.id,

        taskId:
          input.taskId,

        missionId:
          input.missionId,

        messages: [
          {
            role:
              "system",

            content:
              [
                "You are K.I.N.G.S. internal mission intelligence.",
                "You are not the authority.",
                "You must reason about the assigned mission inside the supplied context.",
                "Return a concise actionable engineering/work plan.",
                "Do not claim work was completed unless evidence exists.",
              ].join(
                "\n",
              ),
          },

          {
            role:
              "user",

            content:
              [
                "MISSION OBJECTIVE:",
                input.objective,

                "",

                "AUTHORIZED CONTEXT:",
                input.context,

                "",

                "Produce the next bounded action or sequence of bounded actions required to advance the mission.",
              ].join(
                "\n",
              ),
          },
        ],

        requiredCapabilities:
          input.requiredCapabilities,

        inputModalities:
          [
            "text",
          ] as readonly IntelligenceModality[],

        outputModality:
          "text",

        maxOutputTokens:
          input.maxOutputTokens ??
          1024,

        temperature:
          input.temperature ??
          0,

        allowToolProposals:
          false,
      };

    if (
      !input.model.canHandle(
        request,
      )
    ) {
      return {
        success:
          false,

        request,

        modelResult: {
          success:
            false,

          failure: {
            requestId:
              request.id,

            providerId:
              input.model.identity.providerId,

            modelId:
              input.model.identity.modelId,

            retryable:
              false,

            code:
              "MODEL_CANNOT_HANDLE_REQUEST",

            message:
              "Selected internal intelligence cannot satisfy the mission capability requirements.",

            metadata: {
              requestId:
                request.id,

              startedAt:
                new Date().toISOString(),

              completedAt:
                new Date().toISOString(),

              latencyMs:
                0,
            },
          },
        },

        reasoning:
          "",

        completed:
          false,

        evidence: [
          "model-capability-check:failed",
        ],

        failureReason:
          "Selected intelligence model cannot handle the requested capabilities.",
      };
    }

    const modelResult =
      await input.model.execute(
        request,
      );

    if (
      !modelResult.success
    ) {
      return {
        success:
          false,

        request,

        modelResult,

        reasoning:
          "",

        completed:
          false,

        evidence: [
          "model-execution:failed",
        ],

        failureReason:
          modelResult.failure?.message ??
          "Model execution failed.",
      };
    }

    const reasoning =
      modelResult.response?.content
        .trim() ??
      "";

    if (
      reasoning.length ===
      0
    ) {
      return {
        success:
          false,

        request,

        modelResult,

        reasoning:
          "",

        completed:
          false,

        evidence: [
          "model-execution:empty-output",
        ],

        failureReason:
          "Model returned empty mission reasoning.",
      };
    }

    return {
      success:
        true,

      request,

      modelResult,

      reasoning,

      completed:
        false,

      evidence: [
        "model-capability-check:passed",
        "model-execution:passed",
        "mission-reasoning:captured",
      ],
    };
  }
}
