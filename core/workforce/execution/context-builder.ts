import type {
  AgentDefinition,
  MemoryResult,
  Task,
} from "../types";

import type {
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import {
  MissionContextRetriever,
} from "./mission-context-retriever";

import type {
  MissionMemoryBridge,
} from "../mission-memory-bridge";

import {
  ExecutionContextOptimizer,
} from "./context-optimizer";

import type {
  AgentExecutionContext,
} from "./adapter";

import {
  createMissionExecutionContext,
} from "./mission-execution-context";

import type {
  WorkUnitContract,
} from "../work-unit-contract";

import type {
  GovernedMemoryExecutionPipeline,
  GovernedMemoryExecutionPipelineOptions,
} from "../memory-governed-execution-pipeline";

export class ExecutionContextBuilder {
  private readonly retriever?:
    MissionContextRetriever;

  private readonly knowledgeRuntime?:
    KnowledgeRuntimeAdapter;

  private readonly optimizer:
    ExecutionContextOptimizer;

  constructor(
    knowledgeRuntime?:
      KnowledgeRuntimeAdapter,

    missionMemory?:
      MissionMemoryBridge,

    optimizer:
      ExecutionContextOptimizer =
        new ExecutionContextOptimizer(),

    private readonly governedMemoryPipeline?:
      GovernedMemoryExecutionPipeline,
  ) {
    this.optimizer =
      optimizer;

    this.knowledgeRuntime =
      knowledgeRuntime;

    if (
      missionMemory
    ) {
      this.retriever =
        new MissionContextRetriever(
          missionMemory,
          knowledgeRuntime,
        );
    }
  }

  async build(
    agent:
      AgentDefinition,

    task:
      Task,

    workUnit?:
      WorkUnitContract,

    governedMemoryOptions?:
      GovernedMemoryExecutionPipelineOptions,
  ):
    Promise<AgentExecutionContext> {
    if (
      this.governedMemoryPipeline
    ) {
      if (
        !governedMemoryOptions
      ) {
        throw new Error(
          `K.I.N.G.S. Execution Context Builder: governed memory is configured but no governed memory options were supplied for task "${task.id}"`,
        );
      }

      const governed =
        await this.governedMemoryPipeline.build(
          task,
          agent,
          governedMemoryOptions,
        );

      return this.optimizer.optimize({
        agent,
        task,
        workUnit,
        missionContext:
          governed.executionContext,
        knowledge:
          governed.executionContext
            .knowledge,
      });
    }

    /*
     * Legacy task-scoped knowledge path.
     *
     * Preserve existing behavior when governed memory
     * is not configured.
     */
    if (
      !this.retriever
    ) {
      if (
        !task.knowledgeQuery
      ) {
        return {
          agent,
          task,
          workUnit,
        };
      }

      if (
        !this.knowledgeRuntime
      ) {
        throw new Error(
          `K.I.N.G.S. Execution Context Builder: task "${task.id}" requires knowledge retrieval but no knowledge runtime is configured`,
        );
      }

      const knowledge:
        MemoryResult =
        await this.knowledgeRuntime.retrieve(
          task.knowledgeQuery,
        );

      return this.optimizer.optimize({
        agent,
        task,
        workUnit,
        knowledge,
      });
    }

    /*
     * Existing unified mission-context path.
     */
    const contextPackage =
      await this.retriever.retrieve(
        task,
      );

    const missionContext =
      createMissionExecutionContext({
        missionId:
          contextPackage.missionId,

        taskId:
          contextPackage.taskId,

        agent,

        task,

        memories:
          contextPackage.memories,

        knowledge:
          contextPackage.knowledge,
      });

    return this.optimizer.optimize({
      agent,
      task,
      workUnit,
      missionContext,
      knowledge:
        missionContext.knowledge,
    });
  }
}
