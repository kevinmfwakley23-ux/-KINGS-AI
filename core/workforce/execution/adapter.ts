import type {
  AgentDefinition,
  Task,
  WorkforceResult,
} from "../types";

import type {
  MissionExecutionContext,
} from "./mission-execution-context";

export interface AgentExecutionContext {
  agent: AgentDefinition;
  task: Task;

  /**
   * Unified mission-scoped execution context.
   *
   * This contains only read-only context.
   * It does not grant repository, tool, mutation,
   * or governance authority.
   */
  missionContext?: MissionExecutionContext;

  /**
   * Authoritative project knowledge retrieved for this task.
   *
   * Retained as a compatibility field for existing adapters.
   */
  knowledge?: MissionExecutionContext["knowledge"];
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
