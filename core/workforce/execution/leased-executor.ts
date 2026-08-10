import type {
  ID,
  WorkforceResult,
} from "../types";

import type {
  WorkforceRegistry,
} from "../registry";

import {
  TaskLeaseManager,
} from "../task-lease";

import {
  WorkforceExecutor,
} from "./executor";

export class LeasedWorkforceExecutor {
  constructor(
    private readonly registry: WorkforceRegistry,
    private readonly leaseManager: TaskLeaseManager,
    private readonly workforceExecutor: WorkforceExecutor,
  ) {}

  async execute(
    taskId: ID,
    ownerId: ID,
  ): Promise<WorkforceResult> {
    if (!ownerId.trim()) {
      throw new Error(
        "K.I.N.G.S. Leased Executor: ownerId is required",
      );
    }

    const lease =
      this.leaseManager.get(taskId);

    if (!lease) {
      throw new Error(
        `K.I.N.G.S. Leased Executor: task "${taskId}" has no active lease`,
      );
    }

    if (
      lease.ownerId !== ownerId
    ) {
      throw new Error(
        `K.I.N.G.S. Leased Executor: owner "${ownerId}" does not own lease for task "${taskId}"`,
      );
    }

    const task =
      this.registry.getTask(taskId);

    if (!task) {
      throw new Error(
        `K.I.N.G.S. Leased Executor: task "${taskId}" not found`,
      );
    }

    if (task.status !== "ready") {
      throw new Error(
        `K.I.N.G.S. Leased Executor: task "${taskId}" ` +
        `is not ready for execution`,
      );
    }

    return this.workforceExecutor.execute(
      taskId,
    );
  }
}
