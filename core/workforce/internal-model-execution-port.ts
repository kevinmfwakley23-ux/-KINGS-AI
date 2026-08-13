import type {
  ID,
} from "./types";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import type {
  ProviderAdapterRegistry,
} from "./provider-adapters";

import type {
  WorkforceExecutionPort,
} from "./execution/execution-port";

import type {
  AgentExecutionResult,
} from "./execution/adapter";

export interface InternalModelExecutionTarget {
  providerId:
    ID;
  modelId:
    ID;
}

export interface InternalModelWorkPayload {
  request:
    ModelExecutionRequest;
  target:
    InternalModelExecutionTarget;
}

export class InternalModelExecutionPort
  implements WorkforceExecutionPort {
  constructor(
    private readonly providers:
      ProviderAdapterRegistry,
    private readonly requests:
      ReadonlyMap<
        ID,
        InternalModelWorkPayload
      >,
  ) {}

  async execute(
    taskId:
      ID,
  ):
    Promise<
      AgentExecutionResult
    > {
    const payload =
      this.requests.get(
        taskId,
      );

    if (!payload) {
      return {
        id:
          `internal-execution-missing-${taskId}`,
        taskId,
        agentId:
          "internal-intelligence",
        status:
          "failure",
        summary:
          "No internal model execution payload was registered for the task.",
        artifactIds: [],
        reasoning:
          "Execution payload lookup failed before model execution.",
        verificationReferences: [],
        createdAt:
          new Date().toISOString(),
      };
    }

    const result:
      ModelExecutionResult =
      await this.providers.execute(
        payload.target.providerId,
        payload.target.modelId,
        payload.request,
      );

    if (!result.success) {
      return {
        id:
          `internal-execution-failure-${taskId}`,
        taskId,
        agentId:
          "internal-intelligence",
        status:
          "failure",
        summary:
          result.failure?.message ??
          "Internal model execution failed.",
        artifactIds: [],
        reasoning:
          result.failure?.code ??
          "INTERNAL_MODEL_EXECUTION_FAILED",
        verificationReferences: [],
        createdAt:
          new Date().toISOString(),
        usage:
          result.failure
            ? undefined
            : undefined,
      };
    }

    if (!result.response) {
      return {
        id:
          `internal-execution-invalid-${taskId}`,
        taskId,
        agentId:
          "internal-intelligence",
        status:
          "failure",
        summary:
          "Internal model returned success without a response.",
        artifactIds: [],
        reasoning:
          "Provider contract returned an invalid successful result.",
        verificationReferences: [],
        createdAt:
          new Date().toISOString(),
      };
    }

    return {
      id:
        `internal-execution-${taskId}-${result.response.requestId}`,
      taskId,
      agentId:
        "internal-intelligence",
      status:
        "success",
      summary:
        result.response.content,
      artifactIds: [],
      reasoning:
        `Executed by ${result.response.model.displayName}.`,
      verificationReferences: [
        `model-request-${result.response.requestId}`,
      ],
      createdAt:
        result.response.metadata.completedAt,
      usage: {
        elapsedMs:
          result.response.usage.elapsedMs,
        tokensUsed:
          result.response.usage.tokensUsed,
        iterationsUsed:
          result.response.usage.iterationsUsed,
        estimatedCost:
          result.response.usage.estimatedCost,
      },
    };
  }
}
