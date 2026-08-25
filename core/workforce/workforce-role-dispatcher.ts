import type { AgentDefinition, ID, Task } from "./types";
import { WorkforceRegistry } from "./registry";
import { WorkforceOrchestrator, type WorkforceDispatchResult } from "./workforce-orchestrator";

export interface WorkforceRoleAssignment {
  taskId: ID;
  agentId: ID;
  role: string;
  reason: string;
}

export interface WorkforceRoleDispatchResult {
  dispatch: WorkforceDispatchResult;
  assignment?: WorkforceRoleAssignment;
}

/**
 * Selects an eligible workforce agent for a runnable task.
 * This is assignment/orchestration only; tool and write authority remain
 * with the task's governed execution layer.
 */
export class WorkforceRoleDispatcher {
  constructor(
    private readonly registry: WorkforceRegistry,
    private readonly orchestrator: WorkforceOrchestrator,
  ) {}

  dispatchNext(missionId: ID): WorkforceRoleDispatchResult | undefined {
    const snapshot = this.orchestrator.snapshot(missionId);
    const taskId = snapshot.runnableTaskIds[0];
    if (!taskId) return undefined;

    const task = this.registry.getTask(taskId);
    if (!task) return undefined;

    const agent = this.findEligibleAgent(task);
    if (!agent) {
      return {
        dispatch: {
          taskId,
          status: "blocked",
          reason: `No available workforce agent satisfies the required capabilities for task "${taskId}".`,
        },
      };
    }

    const dispatch = this.orchestrator.dispatchNext(missionId);
    if (!dispatch) return undefined;

    return {
      dispatch,
      assignment: {
        taskId,
        agentId: agent.id,
        role: agent.role,
        reason: `Agent "${agent.id}" satisfies the task capabilities required for "${taskId}".`,
      },
    };
  }

  private findEligibleAgent(task: Task): AgentDefinition | undefined {
    return this.registry.listAgents()
      .filter((agent) => agent.status === "available")
      .filter((agent) => task.requiredCapabilities.every((capability) => agent.capabilities.includes(capability)))
      .filter((agent) => task.requiredToolIds.every((toolId) => agent.toolIds.includes(toolId)))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
  }
}
