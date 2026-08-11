import type {
  AgentDefinition,
  Task,
  WorkforceResult,
} from "../types";

import type {
  MissionExecutionContext,
} from "./mission-execution-context";

import type {
  WorkUnitContract,
} from "../work-unit-contract";

import type {
  BudgetUsage,
} from "../budget-authority";

export interface AgentExecutionContext {
  agent: AgentDefinition;
  task: Task;

  /**
   * Authoritative Work Unit governing this execution.
   *
   * WorkforceExecutor always supplies this value before
   * an adapter is invoked.
   *
   * Optional here only to preserve compatibility with
   * context-construction and optimization tests that
   * operate below the execution-authority boundary.
   */
  workUnit?: WorkUnitContract;

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

export interface AgentExecutionResult
  extends WorkforceResult {
  usage?: BudgetUsage;
}

export interface AgentExecutionAdapter {
  readonly id: string;
  readonly name: string;

  canExecute(
    agent: AgentDefinition,
  ): boolean;

  execute(
    context: AgentExecutionContext,
  ): Promise<AgentExecutionResult>;
}
