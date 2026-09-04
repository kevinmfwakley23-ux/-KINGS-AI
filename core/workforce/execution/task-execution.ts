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

import type {
  WorkforceExecutionPort,
} from "./execution-port";

export class TaskExecutionController {
  constructor(
    private readonly registry: WorkforceRegistry,
    private readonly taskControl: TaskControl,
    private readonly executionPort: WorkforceExecutionPort,
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

    // Execution ownership begins before any adapter/tool work starts. Keeping
    // the task in "running" for the entire execution window prevents an
    // expired lease from making an in-flight task look claimable again.
    this.taskControl.transition(
      taskId,
      "running",
    );

    try {
      const execution =
        await this.executionPort.execute(
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
    } catch (error) {
      const current =
        this.registry.getTask(taskId);

      if (
        current?.status === "running"
      ) {
        this.taskControl.transition(
          taskId,
          "failed",
        );
      }

      throw error;
    }
  }
}
