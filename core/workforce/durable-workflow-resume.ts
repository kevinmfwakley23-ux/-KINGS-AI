import type {
  ID,
} from "./types";

import type {
  ExecutionContinuityRecord,
} from "./execution-continuity";

import {
  RuntimeSessionRegistry,
} from "./runtime-session";

import type {
  SessionRecoveryRecord,
} from "./session-recovery";

export type DurableWorkflowStatus =
  | "running"
  | "interrupted"
  | "resumable"
  | "completed"
  | "failed";

export interface DurableWorkflowTaskState {
  taskId:
    ID;
  status:
    "pending"
    | "ready"
    | "running"
    | "completed"
    | "failed";
  dependencyIds:
    ID[];
  completedAt?:
    string;
  evidenceIds:
    ID[];
  artifactIds:
    ID[];
}

export interface DurableWorkflowState {
  id:
    ID;
  missionId:
    ID;
  workflowId:
    ID;
  ownerId:
    ID;

  status:
    DurableWorkflowStatus;

  taskStates:
    DurableWorkflowTaskState[];

  activeTaskId?:
    ID;

  executionId?:
    ID;

  runtimeSessionId?:
    ID;

  recoveryId?:
    ID;

  lastCheckpointAt?:
    string;

  updatedAt:
    string;
}

export interface DurableWorkflowResumeResult {
  workflow:
    DurableWorkflowState;

  execution:
    ExecutionContinuityRecord;

  recovery?:
    SessionRecoveryRecord;

  resumedTaskId?:
    ID;
}

export class DurableWorkflowResumeAuthority {
  private readonly workflows =
    new Map<
      ID,
      DurableWorkflowState
    >();

  private readonly runtimeSessions:
    RuntimeSessionRegistry;

  constructor(
    runtimeSessions:
      RuntimeSessionRegistry,
  ) {
    this.runtimeSessions =
      runtimeSessions;
  }

  register(
    workflow:
      DurableWorkflowState,
  ):
    DurableWorkflowState {
    if (!workflow.id.trim()) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: workflow id is required",
      );
    }

    if (!workflow.missionId.trim()) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: mission id is required",
      );
    }

    if (!workflow.ownerId.trim()) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: owner id is required",
      );
    }

    if (
      this.workflows.has(
        workflow.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Durable Workflow Resume: workflow "${workflow.id}" already exists`,
      );
    }

    const normalized:
      DurableWorkflowState = {
      ...workflow,
      taskStates:
        workflow.taskStates.map(
          (task) => ({
            ...task,
            dependencyIds: [
              ...task.dependencyIds,
            ],
            evidenceIds: [
              ...task.evidenceIds,
            ],
            artifactIds: [
              ...task.artifactIds,
            ],
          }),
        ),
    };

    this.workflows.set(
      workflow.id,
      normalized,
    );

    return this.clone(
      normalized,
    );
  }

  attachExecution(
    workflowId:
      ID,
    execution:
      ExecutionContinuityRecord,
    updatedAt:
      string,
  ):
    DurableWorkflowState {
    const workflow =
      this.require(
        workflowId,
      );

    if (
      execution.missionId !==
      workflow.missionId
    ) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: execution mission does not match workflow mission",
      );
    }

    if (
      workflow.ownerId !==
      this.requireOwner(
        execution,
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: execution owner does not match workflow owner",
      );
    }

    workflow.executionId =
      execution.id;

    workflow.runtimeSessionId =
      execution.runtimeSessionId;

    workflow.status =
      execution.status ===
      "completed"
        ? "completed"
        : execution.status ===
            "failed"
          ? "failed"
          : "running";

    workflow.lastCheckpointAt =
      execution.updatedAt;

    workflow.updatedAt =
      updatedAt;

    this.workflows.set(
      workflow.id,
      workflow,
    );

    return this.clone(
      workflow,
    );
  }

  recordTaskCompletion(
    workflowId:
      ID,
    taskId:
      ID,
    evidenceIds:
      ID[],
    artifactIds:
      ID[],
    completedAt:
      string,
    updatedAt:
      string,
  ):
    DurableWorkflowState {
    const workflow =
      this.require(
        workflowId,
      );

    const task =
      workflow.taskStates.find(
        (candidate) =>
          candidate.taskId ===
          taskId,
      );

    if (!task) {
      throw new Error(
        `K.I.N.G.S. Durable Workflow Resume: task "${taskId}" was not found`,
      );
    }

    if (
      task.status ===
      "completed"
    ) {
      throw new Error(
        `K.I.N.G.S. Durable Workflow Resume: task "${taskId}" is already completed`,
      );
    }

    task.status =
      "completed";

    task.completedAt =
      completedAt;

    task.evidenceIds = [
      ...evidenceIds,
    ];

    task.artifactIds = [
      ...artifactIds,
    ];

    workflow.activeTaskId =
      undefined;

    workflow.updatedAt =
      updatedAt;

    this.recalculateTaskReadiness(
      workflow,
    );

    this.workflows.set(
      workflow.id,
      workflow,
    );

    return this.clone(
      workflow,
    );
  }

  markInterrupted(
    workflowId:
      ID,
    execution:
      ExecutionContinuityRecord,
    recovery:
      SessionRecoveryRecord,
    updatedAt:
      string,
  ):
    DurableWorkflowState {
    const workflow =
      this.require(
        workflowId,
      );

    if (
      workflow.executionId !==
      execution.id
    ) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: recovery execution does not match workflow execution",
      );
    }

    if (
      workflow.ownerId !==
      this.requireOwner(
        execution,
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: recovery owner does not match workflow owner",
      );
    }

    workflow.status =
      "interrupted";

    workflow.recoveryId =
      recovery.id;

    workflow.runtimeSessionId =
      recovery.lostRuntimeSessionId;

    workflow.lastCheckpointAt =
      execution.updatedAt;

    workflow.updatedAt =
      updatedAt;

    this.workflows.set(
      workflow.id,
      workflow,
    );

    return this.clone(
      workflow,
    );
  }

  resume(
    workflowId:
      ID,
    execution:
      ExecutionContinuityRecord,
    recovery:
      SessionRecoveryRecord |
      undefined,
    updatedAt:
      string,
  ):
    DurableWorkflowResumeResult {
    const workflow =
      this.require(
        workflowId,
      );

    if (
      workflow.status !==
        "interrupted" &&
      workflow.status !==
        "resumable"
    ) {
      throw new Error(
        `K.I.N.G.S. Durable Workflow Resume: workflow "${workflow.id}" cannot resume from "${workflow.status}"`,
      );
    }

    if (
      workflow.executionId !==
      execution.id
    ) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: execution does not match durable workflow",
      );
    }

    if (
      workflow.ownerId !==
      this.requireOwner(
        execution,
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: execution owner does not match workflow owner",
      );
    }

    if (
      execution.status !==
      "active"
    ) {
      throw new Error(
        `K.I.N.G.S. Durable Workflow Resume: execution "${execution.id}" is not active`,
      );
    }

    if (
      recovery &&
      recovery.status !==
        "recovered"
    ) {
      throw new Error(
        `K.I.N.G.S. Durable Workflow Resume: recovery "${recovery.id}" is not completed`,
      );
    }

    if (
      recovery &&
      workflow.recoveryId !==
        recovery.id
    ) {
      throw new Error(
        "K.I.N.G.S. Durable Workflow Resume: recovery does not match durable workflow",
      );
    }

    workflow.status =
      "running";

    workflow.runtimeSessionId =
      execution.runtimeSessionId;

    workflow.lastCheckpointAt =
      execution.updatedAt;

    workflow.updatedAt =
      updatedAt;

    const nextTask =
      this.findNextTask(
        workflow,
      );

    if (nextTask) {
      nextTask.status =
        "running";

      workflow.activeTaskId =
        nextTask.taskId;
    } else {
      workflow.status =
        "completed";
      workflow.activeTaskId =
        undefined;
    }

    this.workflows.set(
      workflow.id,
      workflow,
    );

    return {
      workflow:
        this.clone(
          workflow,
        ),
      execution:
        this.cloneExecution(
          execution,
        ),
      recovery:
        recovery
          ? this.cloneRecovery(
              recovery,
            )
          : undefined,
      resumedTaskId:
        nextTask?.taskId,
    };
  }

  get(
    workflowId:
      ID,
  ):
    DurableWorkflowState |
    undefined {
    const workflow =
      this.workflows.get(
        workflowId,
      );

    return workflow
      ? this.clone(
          workflow,
        )
      : undefined;
  }

  private findNextTask(
    workflow:
      DurableWorkflowState,
  ):
    DurableWorkflowTaskState |
    undefined {
    return workflow.taskStates.find(
      (task) => {
        if (
          task.status !==
            "pending" &&
          task.status !==
            "ready"
        ) {
          return false;
        }

        return task.dependencyIds.every(
          (dependencyId) =>
            workflow.taskStates.some(
              (dependency) =>
                dependency.taskId ===
                  dependencyId &&
                dependency.status ===
                  "completed",
            ),
        );
      },
    );
  }

  private recalculateTaskReadiness(
    workflow:
      DurableWorkflowState,
  ):
    void {
    for (
      const task of
        workflow.taskStates
    ) {
      if (
        task.status !==
        "pending"
      ) {
        continue;
      }

      const dependenciesComplete =
        task.dependencyIds.every(
          (dependencyId) =>
            workflow.taskStates.some(
              (dependency) =>
                dependency.taskId ===
                  dependencyId &&
                dependency.status ===
                  "completed",
            ),
        );

      if (
        dependenciesComplete
      ) {
        task.status =
          "ready";
      }
    }
  }

  private require(
    workflowId:
      ID,
  ):
    DurableWorkflowState {
    const workflow =
      this.workflows.get(
        workflowId,
      );

    if (!workflow) {
      throw new Error(
        `K.I.N.G.S. Durable Workflow Resume: workflow "${workflowId}" was not found`,
      );
    }

    return workflow;
  }

  private requireOwner(
    execution:
      ExecutionContinuityRecord,
  ):
    ID {
    const runtime =
      this.runtimeSessions.get(
        execution.runtimeSessionId,
      );

    if (!runtime) {
      throw new Error(
        `K.I.N.G.S. Durable Workflow Resume: runtime session "${execution.runtimeSessionId}" was not found`,
      );
    }

    return runtime.ownerId;
  }

  private clone(
    workflow:
      DurableWorkflowState,
  ):
    DurableWorkflowState {
    return {
      ...workflow,
      taskStates:
        workflow.taskStates.map(
          (task) => ({
            ...task,
            dependencyIds: [
              ...task.dependencyIds,
            ],
            evidenceIds: [
              ...task.evidenceIds,
            ],
            artifactIds: [
              ...task.artifactIds,
            ],
          }),
        ),
    };
  }

  private cloneExecution(
    execution:
      ExecutionContinuityRecord,
  ):
    ExecutionContinuityRecord {
    return {
      ...execution,
    };
  }

  private cloneRecovery(
    recovery:
      SessionRecoveryRecord,
  ):
    SessionRecoveryRecord {
    return {
      ...recovery,
    };
  }
}
