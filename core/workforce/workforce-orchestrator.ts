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
 * This authority only selects and tracks scheduling state; execution authority
 * remains in the governed worker/task-control layers.
 */
export class WorkforceOrchestrator {
  private readonly runtimeStatus = new Map<ID, TaskStatus>();

  constructor(private readonly registry: WorkforceRegistry) {}

  snapshot(missionId: ID): WorkforceOrchestrationSnapshot {
    const tasks = this.registry
      .listTasks()
      .filter((task) => task.missionId === missionId);

    const completedTaskIds = tasks
      .filter((task) => this.statusOf(task) === "completed")
      .map((task) => task.id);

    const activeTaskIds = tasks
      .filter((task) => this.statusOf(task) === "running")
      .map((task) => task.id);

    const runnableTaskIds: ID[] = [];
    const blockedTaskIds: ID[] = [];

    for (const task of tasks) {
      const status = this.statusOf(task);
      if (status === "completed" || status === "running") continue;

      const unresolvedDependencies = task.dependencyIds.filter(
        (dependencyId) => !completedTaskIds.includes(dependencyId),
      );

      if (unresolvedDependencies.length === 0 && this.isReadyStatus(status)) {
        runnableTaskIds.push(task.id);
      } else {
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

    const currentStatus = this.statusOf(task);
    if (currentStatus === "completed") {
      return {
        taskId,
        status: "already-completed",
        reason: `Task "${taskId}" is already completed.`,
      };
    }

    if (currentStatus === "running") {
      return {
        taskId,
        status: "already-active",
        reason: `Task "${taskId}" is already active.`,
      };
    }

    this.runtimeStatus.set(taskId, "running");
    return {
      taskId,
      status: "dispatched",
      reason: `Task "${taskId}" is runnable and has been dispatched.`,
    };
  }

  complete(taskId: ID): Task {
    const task = this.registry.getTask(taskId);
    if (!task) {
      throw new Error(`K.I.N.G.S. Workforce Orchestrator: task "${taskId}" was not found`);
    }

    if (this.statusOf(task) !== "running") {
      throw new Error(`K.I.N.G.S. Workforce Orchestrator: task "${taskId}" is not active`);
    }

    this.runtimeStatus.set(taskId, "completed");
    return task;
  }

  block(taskId: ID): Task {
    const task = this.registry.getTask(taskId);
    if (!task) {
      throw new Error(`K.I.N.G.S. Workforce Orchestrator: task "${taskId}" was not found`);
    }

    this.runtimeStatus.set(taskId, "blocked");
    return task;
  }

  fail(taskId: ID): Task {
    const task = this.registry.getTask(taskId);
    if (!task) {
      throw new Error(`K.I.N.G.S. Workforce Orchestrator: task "${taskId}" was not found`);
    }

    this.runtimeStatus.set(taskId, "failed");
    return task;
  }

  private statusOf(task: Task): TaskStatus {
    return this.runtimeStatus.get(task.id) ?? task.status;
  }

  private isReadyStatus(status: TaskStatus): boolean {
    return status === "ready" || status === "pending";
  }
}
