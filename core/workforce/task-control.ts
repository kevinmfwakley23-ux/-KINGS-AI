import type {
  ID,
  Task,
  TaskStatus,
} from "./types";

import type {
  WorkforceRegistry,
} from "./registry";

export interface TaskContractValidation {
  valid: boolean;
  reasons: string[];
}

export interface TaskTransitionResult {
  taskId: ID;
  from: TaskStatus;
  to: TaskStatus;
}

const ALLOWED_TRANSITIONS: Record<
  TaskStatus,
  TaskStatus[]
> = {
  pending: [
    "ready",
    "blocked",
    "cancelled",
  ],
  ready: [
    "running",
    "blocked",
    "cancelled",
  ],
  running: [
    "completed",
    "failed",
    "cancelled",
  ],
  blocked: [
    "ready",
    "cancelled",
  ],
  completed: [],
  failed: [],
  cancelled: [],
};

export class TaskControl {
  constructor(
    private readonly registry: WorkforceRegistry,
  ) {}

  validate(
    task: Task,
  ): TaskContractValidation {
    const reasons: string[] = [];

    if (!task.id) {
      reasons.push(
        "Task id is required.",
      );
    }

    if (!task.missionId) {
      reasons.push(
        "Task missionId is required.",
      );
    }

    if (!task.name.trim()) {
      reasons.push(
        "Task name is required.",
      );
    }

    if (!task.description.trim()) {
      reasons.push(
        "Task description is required.",
      );
    }

    if (!Array.isArray(
      task.requiredCapabilities,
    )) {
      reasons.push(
        "Task requiredCapabilities must be an array.",
      );
    }

    if (!Array.isArray(
      task.requiredToolIds,
    )) {
      reasons.push(
        "Task requiredToolIds must be an array.",
      );
    }

    if (!Array.isArray(
      task.dependencyIds,
    )) {
      reasons.push(
        "Task dependencyIds must be an array.",
      );
    }

    if (!Array.isArray(
      task.inputReferences,
    )) {
      reasons.push(
        "Task inputReferences must be an array.",
      );
    }

    if (!Array.isArray(
      task.expectedOutputs,
    )) {
      reasons.push(
        "Task expectedOutputs must be an array.",
      );
    }

    if (!task.createdAt) {
      reasons.push(
        "Task createdAt is required.",
      );
    }

    if (!task.updatedAt) {
      reasons.push(
        "Task updatedAt is required.",
      );
    }

    return {
      valid: reasons.length === 0,
      reasons,
    };
  }

  transition(
    taskId: ID,
    nextStatus: TaskStatus,
  ): TaskTransitionResult {
    const task =
      this.registry.getTask(taskId);

    if (!task) {
      throw new Error(
        `K.I.N.G.S. Task Control: task "${taskId}" not found`,
      );
    }

    const allowed =
      ALLOWED_TRANSITIONS[
        task.status
      ];

    if (
      !allowed.includes(nextStatus)
    ) {
      throw new Error(
        `K.I.N.G.S. Task Control: invalid transition "${task.status}" -> "${nextStatus}" for task "${taskId}"`,
      );
    }

    const previousStatus =
      task.status;

    task.status =
      nextStatus;

    task.updatedAt =
      new Date().toISOString();

    return {
      taskId,
      from: previousStatus,
      to: nextStatus,
    };
  }
}
