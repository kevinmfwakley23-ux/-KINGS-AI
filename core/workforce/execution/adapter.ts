import type {
  AgentDefinition,
  Task,
  WorkforceResult,
} from "../types";

export interface AgentExecutionContext {
  agent: AgentDefinition;
  task: Task;
}

export interface AgentExecutionAdapter {
  readonly id: string;
  readonly name: string;

  canExecute(agent: AgentDefinition): boolean;

  execute(
    context: AgentExecutionContext,
  ): Promise<WorkforceResult>;
}
