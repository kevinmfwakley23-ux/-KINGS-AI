import type { ID, Task, TaskStatus } from "./types";
import { WorkforceRegistry } from "./registry";

export interface WorkforceOrchestrationSnapshot {
  runnableTaskIds: ID[];
  blockedTaskIds: ID[];
  activeTaskIds: ID[];
  completedTaskIds: ID[];
}

export interface WorkforceDispatchResult {
  taskId: ID;
  status: "dispatched" | "blocked" | "already-active" | "already-completed";
  reason: string;
}

/**
 * Mission-facing dependency-aware scheduler for the existing workforce registry.
 * This authority only selects work; it does not grant tool, network, or write authority.
 */
export class WorkforceOrchestrator {
  constructor(private readonly registry: WorkforceRegistry) {}

  snapshot(missionId: ID): WorkforceOrchestrationSnapshot {
    const tasks = this.registry
      .listTasks()
      .filter((task) => task.missionId === missionId);

    const completedTaskIds = tasks
      .filter((task) => task.status === "completed")
      .map((task) => task.id);

    const activeTaskIds = tasks
      .filter((task) => task.status === "running")
      .map((task) => task.id);

    const runnableTaskIds: ID[] = [];
    const blockedTaskIds: ID[] = [];

    for (const task of tasks) {
      if (task.status === "completed" || task.status === "running") continue;
      const unresolvedDependencies = task.dependencyIds.filter(
        (dependencyId) => !completedTaskIds.includes(dependencyId),
      );

      if (unresolvedDependencies.length === 0 && this.isReadyStatus(task.status)) {
        runnableTaskIds.push(task.id);
      } else if (task.status === "blocked" || unresolvedDependencies.length > 0) {
        blockedTaskIds.push(task.id);
      }
    }

    return {
      runnableTaskIds,
      blockedTaskIds,
      activeTaskIds,
      completedTaskIds,
    };
  }

  dispatchNext(missionId: ID): WorkforceDispatchResult | undefined {
    const snapshot = this.snapshot(missionId);
    const taskId = snapshot.runnableTaskIds[0];
    if (!taskId) return undefined;

    const task = this.registry.getTask(taskId);
    if (!task) return undefined;
    if (task.status === "completed") {
      return {
        taskId,
        status: "already-completed",
        reason: `Task "${taskId}" is already completed.`,
      };
    }
    if (task.status === "running") {
      return {
        taskId,
        status: "already-active",
        reason: `Task "${taskId}" is already running.`,
      };
    }

    this.registry.updateTask(taskId, { status: "running" });
    return {
      taskId,
      status: "dispatched",
      reason: `Task "${taskId}" is runnable and has been dispatched.`,
    };
  }

  complete(taskId: ID): Task {
    const task = this.registry.requireTask(taskId);
    if (task.status !== "running") {
      throw new Error(`K.I.N.G.S. Workforce Orchestrator: task "${taskId}" is not running`);
    }
    this.registry.updateTask(taskId, { status: "completed" });
    return this.registry.requireTask(taskId);
  }

  block(taskId: ID): Task {
    const task = this.registry.requireTask(taskId);
    this.registry.updateTask(taskId, { status: "blocked" });
    return this.registry.requireTask(taskId);
  }

  private isReadyStatus(status: TaskStatus): boolean {
    return status === "ready";
  }
}
