import type {
  ID,
  WorkforceResult,
} from "../types";

import {
  TaskLeaseManager,
} from "../task-lease";

import {
  TaskExecutionController,
} from "./task-execution";

export class LeasedTaskExecutionController {
  constructor(
    private readonly leaseManager: TaskLeaseManager,
    private readonly taskExecutionController: TaskExecutionController,
  ) {}

  async execute(
    taskId: ID,
    ownerId: ID,
    durationMs: number,
  ): Promise<WorkforceResult> {
    const lease =
      this.leaseManager.claim(
        taskId,
        ownerId,
        durationMs,
      );

    try {
      return await this.taskExecutionController.execute(
        taskId,
      );
    } finally {
      const activeLease =
        this.leaseManager.get(taskId);

      if (
        activeLease &&
        activeLease.leaseId === lease.leaseId &&
        activeLease.ownerId === ownerId
      ) {
        this.leaseManager.release(
          taskId,
          ownerId,
        );
      }
    }
  }
}
