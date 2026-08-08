import type {
  ID,
  Task,
  WorkforceResult,
} from "../types";
import type {
  AgentExecutionAdapter,
} from "./adapter";
import type {
  WorkforceRegistry,
} from "../registry";

export class WorkforceExecutor {
  constructor(
    private readonly registry: WorkforceRegistry,
    private readonly adapters: AgentExecutionAdapter[] = [],
  ) {}

  async execute(taskId: ID): Promise<WorkforceResult> {
    const task = this.registry.getTask(taskId);

    if (!task) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: task "${taskId}" not found`,
      );
    }

    if (!task.assignedAgentId) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: task "${taskId}" has no assigned agent`,
      );
    }

    const agent = this.registry.getAgent(task.assignedAgentId);

    if (!agent) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: agent "${task.assignedAgentId}" not found`,
      );
    }

    const adapter = this.adapters.find(
      (candidate) => candidate.canExecute(agent),
    );

    if (!adapter) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: no adapter can execute agent "${agent.id}"`,
      );
    }

    return adapter.execute({
      agent,
      task,
    });
  }
}
