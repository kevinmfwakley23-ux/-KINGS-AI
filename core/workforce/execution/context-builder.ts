import type {
  AgentDefinition,
  MemoryResult,
  Task,
} from "../types";

import type {
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import type {
  AgentExecutionContext,
} from "./adapter";

import {
  ExecutionContextOptimizer,
} from "./context-optimizer";

export class ExecutionContextBuilder {
  private readonly optimizer:
    ExecutionContextOptimizer;

  constructor(
    private readonly knowledgeRuntime?: KnowledgeRuntimeAdapter,
    optimizer?: ExecutionContextOptimizer,
  ) {
    this.optimizer =
      optimizer ?? new ExecutionContextOptimizer();
  }

  async build(
    agent: AgentDefinition,
    task: Task,
  ): Promise<AgentExecutionContext> {
    let knowledge: MemoryResult | undefined;

    if (task.knowledgeQuery) {
      if (!this.knowledgeRuntime) {
        throw new Error(
          `K.I.N.G.S. Context Builder: task "${task.id}" ` +
          "requires knowledge retrieval but no knowledge runtime is configured",
        );
      }

      knowledge =
        await this.knowledgeRuntime.retrieve(
          task.knowledgeQuery,
        );
    }

    return this.optimizer.optimize({
      agent,
      task,
      knowledge,
    });
  }
}
