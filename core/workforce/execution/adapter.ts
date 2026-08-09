import type {
  AgentDefinition,
  MemoryResult,
  Task,
  WorkforceResult,
} from "../types";

export interface AgentExecutionContext {
  agent: AgentDefinition;
  task: Task;

  /**
   * Authoritative project knowledge retrieved for this task.
   *
   * This is read-only execution context. It does not grant
   * repository, tool, or mutation authority.
   */
  knowledge?: MemoryResult;
}

export interface AgentExecutionAdapter {
  readonly id: string;
  readonly name: string;

  canExecute(
    agent: AgentDefinition,
  ): boolean;

  execute(
    context: AgentExecutionContext,
  ): Promise<WorkforceResult>;
}
