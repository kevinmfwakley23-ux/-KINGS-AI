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

    if (task.status !== "ready") {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: task "${taskId}" ` +
        `is not executable because its status is "${task.status}"`,
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

    const missingCapabilities =
      task.requiredCapabilities.filter(
        (capability) =>
          !agent.capabilities.includes(capability),
      );

    if (missingCapabilities.length > 0) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: agent "${agent.id}" ` +
        `lacks required capabilities: ${missingCapabilities.join(", ")}`,
      );
    }

    const unauthorizedTools: string[] = [];

    for (const toolId of task.requiredToolIds) {
      const tool = this.registry.getTool(toolId);

      if (!tool) {
        unauthorizedTools.push(
          `${toolId} (not registered)`,
        );
        continue;
      }

      if (!agent.toolIds.includes(toolId)) {
        unauthorizedTools.push(
          `${toolId} (agent not authorized)`,
        );
        continue;
      }

      if (!tool.enabled) {
        unauthorizedTools.push(
          `${toolId} (tool disabled)`,
        );
      }
    }

    if (unauthorizedTools.length > 0) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: agent "${agent.id}" ` +
        `cannot access required tools: ${unauthorizedTools.join(", ")}`,
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
