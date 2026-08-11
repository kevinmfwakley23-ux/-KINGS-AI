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
    agent: AgentDefinition,
    task: Task,
    workUnit?: WorkUnitContract,
  ): Promise<AgentExecutionContext> {
    /*
     * Legacy task-scoped knowledge path.
     *
     * Preserve INTELLIGENCE-004 behavior when a
     * mission memory bridge has not been configured.
     */
    if (!this.retriever) {
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
     * Unified mission context path.
     *
     * Mission memory and Project Brain knowledge are
     * retrieved together before optimization.
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
