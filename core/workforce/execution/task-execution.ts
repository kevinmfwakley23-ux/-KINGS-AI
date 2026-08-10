import type {
  ID,
  WorkforceResult,
} from "../types";

import type {
  WorkforceRegistry,
} from "../registry";

import {
  TaskControl,
} from "../task-control";

import {
  WorkforceExecutor,
} from "./executor";

export class TaskExecutionController {
  constructor(
    private readonly registry: WorkforceRegistry,
    private readonly taskControl: TaskControl,
    private readonly workforceExecutor: WorkforceExecutor,
  ) {}

  async execute(
    taskId: ID,
  ): Promise<WorkforceResult> {
    const task =
      this.registry.getTask(taskId);

    if (!task) {
      throw new Error(
        `K.I.N.G.S. Task Execution: task "${taskId}" not found`,
      );
    }

    if (task.status !== "ready") {
      throw new Error(
        `K.I.N.G.S. Task Execution: task "${taskId}" ` +
        `is not ready for execution`,
      );
    }

    const execution =
      await this.workforceExecutor.execute(
        taskId,
      );

    if (
      execution.status === "success"
    ) {
      this.taskControl.transition(
        taskId,
        "completed",
      );
    } else {
      this.taskControl.transition(
        taskId,
        "failed",
      );
    }

    return execution;
  }
}
