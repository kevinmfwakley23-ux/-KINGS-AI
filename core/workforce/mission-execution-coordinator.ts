import type { AgentDefinition, ID, Task } from "./types";
import { WorkforceRegistry } from "./registry";

export interface MissionExecutionDispatch {
  missionId: ID;
  taskId: ID;
  agentId: ID;
  dispatchedAt: string;
}

export interface MissionExecutionCoordinatorSnapshot {
  missionId: ID;
  readyTaskIds: ID[];
  runnableTaskIds: ID[];
  blockedTaskIds: ID[];
  runningTaskIds: ID[];
  completedTaskIds: ID[];
  failedTaskIds: ID[];
}

export class MissionExecutionCoordinator {
  constructor(private readonly options: { registry: WorkforceRegistry }) {}

  snapshot(missionId: ID): MissionExecutionCoordinatorSnapshot {
    this.requireMission(missionId);
    const tasks = this.options.registry.listTasks().filter((task) => task.missionId === missionId);
    const dependencyComplete = (task: Task) =>
      task.dependencyIds.every((id) => this.options.registry.getTask(id)?.status === "completed");

    const readyTaskIds = tasks.filter((task) => task.status === "ready" && dependencyComplete(task)).map((task) => task.id);
    return {
      missionId,
      readyTaskIds,
      runnableTaskIds: [...readyTaskIds],
      blockedTaskIds: tasks.filter((task) => task.status === "blocked" || (task.status === "ready" && !dependencyComplete(task))).map((task) => task.id),
      runningTaskIds: tasks.filter((task) => task.status === "running").map((task) => task.id),
      completedTaskIds: tasks.filter((task) => task.status === "completed").map((task) => task.id),
      failedTaskIds: tasks.filter((task) => task.status === "failed").map((task) => task.id),
    };
  }

  dispatchNext(missionId: ID): MissionExecutionDispatch | undefined {
    const snapshot = this.snapshot(missionId);
    for (const taskId of snapshot.readyTaskIds) {
      const task = this.options.registry.getTask(taskId);
      if (!task) continue;
      const agent = this.selectAgent(task);
      if (!agent) continue;
      task.assignedAgentId = agent.id;
      task.status = "running";
      task.updatedAt = new Date().toISOString();
      return { missionId, taskId: task.id, agentId: agent.id, dispatchedAt: task.updatedAt };
    }
    return undefined;
  }

  completeTask(taskId: ID): Task {
    const task = this.options.registry.getTask(taskId);
    if (!task) throw new Error(`K.I.N.G.S. Mission Execution Coordinator: task "${taskId}" not found`);
    if (task.status !== "running") throw new Error(`K.I.N.G.S. Mission Execution Coordinator: task "${taskId}" is not running`);
    task.status = "completed";
    task.updatedAt = new Date().toISOString();
    return task;
  }

  failTask(taskId: ID): Task {
    const task = this.options.registry.getTask(taskId);
    if (!task) throw new Error(`K.I.N.G.S. Mission Execution Coordinator: task "${taskId}" not found`);
    if (task.status !== "running") throw new Error(`K.I.N.G.S. Mission Execution Coordinator: task "${taskId}" is not running`);
    task.status = "failed";
    task.updatedAt = new Date().toISOString();
    return task;
  }

  private selectAgent(task: Task): AgentDefinition | undefined {
    const candidates = this.options.registry.listAgents().filter((agent) => {
      if (agent.status !== "available") return false;
      if (task.assignedAgentId && task.assignedAgentId !== agent.id) return false;
      if (!task.requiredCapabilities.every((capability) => agent.capabilities.includes(capability))) return false;
      return task.requiredToolIds.every((toolId) => {
        const tool = this.options.registry.getTool(toolId);
        return Boolean(tool?.enabled && agent.toolIds.includes(toolId));
      });
    });
    return candidates.sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  private requireMission(missionId: ID): void {
    if (!this.options.registry.getMission(missionId)) {
      throw new Error(`K.I.N.G.S. Mission Execution Coordinator: mission "${missionId}" not found`);
    }
  }
}
