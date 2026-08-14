import type {
  ID,
  Task,
  WorkforceResult,
} from "./types";

import {
  V1AcceptanceDecision,
} from "./v1-acceptance-001";

import {
  RuntimeAwareWorkforceExecutor,
} from "./execution/runtime-aware-executor";

import type {
  AgentExecutionContext,
  AgentExecutionAdapter,
} from "./execution/adapter";

export interface V1AcceptanceExecutionContextBridgeRequest {
  acceptance:
    V1AcceptanceDecision;

  task:
    Task;
}

export interface V1AcceptanceExecutionContextBridgeResult {
  accepted:
    boolean;

  executed:
    boolean;

  taskId:
    ID;

  missionId:
    ID;

  memoriesDelivered:
    number;

  knowledgeDelivered:
    boolean;

  reasoning:
    string[];

  context:
    AgentExecutionContext | undefined;

  result:
    WorkforceResult | undefined;
}

export class V1AcceptanceExecutionContextBridge {
  constructor(
    private readonly executor:
      RuntimeAwareWorkforceExecutor,
  ) {}

  async executeAccepted(
    request:
      V1AcceptanceExecutionContextBridgeRequest,
  ):
    Promise<V1AcceptanceExecutionContextBridgeResult> {
    if (
      !request.acceptance.accepted
    ) {
      return {
        accepted:
          false,

        executed:
          false,

        taskId:
          request.task.id,

        missionId:
          request.task.missionId,

        memoriesDelivered:
          0,

        knowledgeDelivered:
          false,

        reasoning: [
          ...request.acceptance.reasons,
        ],

        context:
          undefined,

        result:
          undefined,
      };
    }

    const result =
      await this.executor.execute(
        request.task.id,
      );

    return {
      accepted:
        true,

      executed:
        result.status ===
        "success",

      taskId:
        request.task.id,

      missionId:
        request.task.missionId,

      memoriesDelivered:
        0,

      knowledgeDelivered:
        false,

      reasoning: [
        result.reasoning ??
          result.summary ??
          "Accepted task executed through the governed workforce executor.",
      ],

      context:
        undefined,

      result,
    };
  }
}

export type V1AcceptanceExecutionContextObserver =
  (
    context:
      AgentExecutionContext,
  ) =>
    void;

export function createObservingAdapter(
  observer:
    V1AcceptanceExecutionContextObserver,
):
  AgentExecutionAdapter {
  return {
    id:
      "v1-acceptance-008-observer",

    name:
      "V1 Acceptance 008 Context Observer",

    canExecute(
      agent,
    ):
      boolean {
      return agent.capabilities.includes(
        "v1-acceptance-008",
      );
    },

    async execute(
      context,
    ):
      Promise<
        ReturnType<
          AgentExecutionAdapter["execute"]
        > extends Promise<infer T>
          ? T
          : never
      > {
      observer(
        context,
      );

      return {
        id:
          `result-${context.task.id}`,

        taskId:
          context.task.id,

        agentId:
          context.agent.id,

        status:
          "success",

        summary:
          "V1-ACCEPTANCE-008 execution context observer completed.",

        artifactIds: [],

        reasoning:
          `Mission context memory count: ${context.missionContext?.memories.length ?? 0}; ` +
          `Knowledge delivered: ${context.knowledge !== undefined}`,

        verificationReferences: [],

        createdAt:
          new Date().toISOString(),
      };
    },
  };
}
