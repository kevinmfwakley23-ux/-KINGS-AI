import type {
  AgentDefinition,
  Task,
  WorkforceResult,
} from "./types";

import type {
  AgentExecutionAdapter,
  AgentExecutionContext,
  AgentExecutionResult,
} from "./execution/adapter";

import {
  GovernedMemoryExecutionPipeline,
} from "./memory-governed-execution-pipeline";

export interface GovernedWorkerAdapterDependencies {
  pipeline:
    GovernedMemoryExecutionPipeline;
}

export interface GovernedWorkerExecutionObservation {
  missionId:
    string;

  taskId:
    string;

  selectedMemoryIds:
    string[];

  estimatedContextTokens:
    number;

  remainingContextTokens:
    number;

  knowledgeIds:
    string[];
}

export class GovernedMemoryWorkerAdapter
  implements AgentExecutionAdapter {
  readonly id =
    "governed-memory-worker-adapter";

  readonly name =
    "Governed Memory Worker Adapter";

  private lastObservation:
    GovernedWorkerExecutionObservation |
    undefined;

  constructor(
    private readonly dependencies:
      GovernedWorkerAdapterDependencies,
  ) {}

  canExecute(
    agent:
      AgentDefinition,
  ):
    boolean {
    return agent.capabilities.includes(
      "coding",
    );
  }

  getLastObservation():
    GovernedWorkerExecutionObservation |
    undefined {
    return this.lastObservation
      ? {
          ...this.lastObservation,
          selectedMemoryIds:
            [
              ...this.lastObservation
                .selectedMemoryIds,
            ],
          knowledgeIds:
            [
              ...this.lastObservation
                .knowledgeIds,
            ],
        }
      : undefined;
  }

  async prepare(
    task:
      Task,
    agent:
      AgentDefinition,
    options:
      Parameters<
        GovernedMemoryExecutionPipeline["build"]
      >[2],
  ):
    Promise<AgentExecutionContext> {
    const governed =
      await this.dependencies.pipeline.build(
        task,
        agent,
        options,
      );

    this.lastObservation = {
      missionId:
        governed.missionId,

      taskId:
        governed.taskId,

      selectedMemoryIds:
        [
          ...governed.selectedMemoryIds,
        ],

      estimatedContextTokens:
        governed.estimatedContextTokens,

      remainingContextTokens:
        governed.remainingContextTokens,

      knowledgeIds:
        governed.executionContext
          .knowledge?.records
          .map(
            (
              record,
            ) =>
              record.id,
          ) ??
        [],
    };

    return {
      agent,

      task,

      missionContext:
        governed.executionContext,

      knowledge:
        governed.executionContext
          .knowledge,
    };
  }

  async execute(
    context:
      AgentExecutionContext,
  ):
    Promise<AgentExecutionResult> {
    if (
      !context.missionContext
    ) {
      return {
        id:
          `governed-memory-execution-rejected-${context.task.id}`,

        taskId:
          context.task.id,

        agentId:
          context.agent.id,

        status:
          "rejected",

        summary:
          "Governed memory execution requires mission context.",

        reasoning:
          "The worker adapter rejected execution because no governed mission execution context was supplied.",

        artifactIds:
          [],

        verificationReferences:
          [],

        createdAt:
          new Date().toISOString(),
      };
    }

    const memoryIds =
      context.missionContext.memories.map(
        (
          memory,
        ) =>
          memory.id,
      );

    const knowledgeIds =
      context
        .missionContext
        .knowledge?.records
        .map(
          (
            record,
          ) =>
            record.id,
        ) ??
      [];

    return {
      id:
        `governed-memory-execution-${context.task.id}`,

      taskId:
        context.task.id,

      agentId:
        context.agent.id,

      status:
        "success",

      summary:
        "Worker execution received governed memory context.",

      reasoning:
        [
          "Governed mission memory delivered:",
          ...memoryIds,
          "Authoritative knowledge delivered:",
          ...knowledgeIds,
        ].join(
          " ",
        ),

      artifactIds:
        [],

      verificationReferences:
        [
          ...memoryIds,
          ...knowledgeIds,
        ],

      createdAt:
        new Date().toISOString(),
    };
  }
}
