import type {
  ID,
} from "./types";

import type {
  ExecutionContinuityRecord,
} from "./execution-continuity";

import type {
  RuntimeSessionRegistry,
  RuntimeSession,
} from "./runtime-session";

export type WorkflowCheckpointStatus =
  | "active"
  | "paused"
  | "completed";

export interface WorkflowCheckpoint {
  id:
    ID;

  workflowId:
    ID;

  missionId:
    ID;

  ownerId:
    ID;

  executionId:
    ID;

  runtimeSessionId:
    ID;

  currentTaskId:
    ID;

  completedTaskIds:
    ID[];

  pendingTaskIds:
    ID[];

  status:
    WorkflowCheckpointStatus;

  createdAt:
    string;

  updatedAt:
    string;

  resumeCount:
    number;
}

export interface WorkflowCheckpointCreateRequest {
  id:
    ID;

  workflowId:
    ID;

  missionId:
    ID;

  ownerId:
    ID;

  execution:
    ExecutionContinuityRecord;

  currentTaskId:
    ID;

  completedTaskIds:
    ID[];

  pendingTaskIds:
    ID[];

  createdAt:
    string;
}

export interface WorkflowCheckpointResumeRequest {
  checkpointId:
    ID;

  ownerId:
    ID;

  replacementRuntimeSessionId:
    ID;

  resumedAt:
    string;
}

export interface WorkflowCheckpointResumeResult {
  checkpoint:
    WorkflowCheckpoint;

  runtime:
    RuntimeSession;
}

export class WorkflowCheckpointAuthority {
  private readonly checkpoints =
    new Map<
      ID,
      WorkflowCheckpoint
    >();

  constructor(
    private readonly runtimeSessions:
      RuntimeSessionRegistry,
  ) {}

  create(
    request:
      WorkflowCheckpointCreateRequest,
  ):
    WorkflowCheckpoint {
    if (
      !request.ownerId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Checkpoint: owner id is required",
      );
    }

    const runtime =
      this.runtimeSessions.get(
        request.execution.runtimeSessionId,
      );

    if (!runtime) {
      throw new Error(
        `K.I.N.G.S. Workflow Checkpoint: runtime session "${request.execution.runtimeSessionId}" was not found`,
      );
    }

    if (
      runtime.ownerId !==
      request.ownerId
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Checkpoint: execution runtime is not owned by workflow owner",
      );
    }

    if (
      this.checkpoints.has(
        request.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Workflow Checkpoint: checkpoint "${request.id}" already exists`,
      );
    }

    const checkpoint:
      WorkflowCheckpoint = {
      id:
        request.id,
      workflowId:
        request.workflowId,
      missionId:
        request.missionId,
      ownerId:
        request.ownerId,
      executionId:
        request.execution.id,
      runtimeSessionId:
        request.execution.runtimeSessionId,
      currentTaskId:
        request.currentTaskId,
      completedTaskIds: [
        ...request.completedTaskIds,
      ],
      pendingTaskIds: [
        ...request.pendingTaskIds,
      ],
      status:
        request.execution.status ===
        "completed"
          ? "completed"
          : "active",
      createdAt:
        request.createdAt,
      updatedAt:
        request.createdAt,
      resumeCount:
        0,
    };

    this.checkpoints.set(
      checkpoint.id,
      checkpoint,
    );

    return this.clone(
      checkpoint,
    );
  }

  pause(
    checkpointId:
      ID,
    updatedAt:
      string,
  ):
    WorkflowCheckpoint {
    const checkpoint =
      this.require(
        checkpointId,
      );

    if (
      checkpoint.status !==
      "active"
    ) {
      throw new Error(
        `K.I.N.G.S. Workflow Checkpoint: checkpoint "${checkpointId}" cannot be paused from "${checkpoint.status}"`,
      );
    }

    checkpoint.status =
      "paused";
    checkpoint.updatedAt =
      updatedAt;

    return this.clone(
      checkpoint,
    );
  }

  resume(
    request:
      WorkflowCheckpointResumeRequest,
  ):
    WorkflowCheckpointResumeResult {
    const checkpoint =
      this.require(
        request.checkpointId,
      );

    if (
      checkpoint.status !==
      "paused"
    ) {
      throw new Error(
        `K.I.N.G.S. Workflow Checkpoint: checkpoint "${checkpoint.id}" cannot be resumed from "${checkpoint.status}"`,
      );
    }

    if (
      checkpoint.ownerId !==
      request.ownerId
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Checkpoint: owner identity does not match checkpoint owner",
      );
    }

    const replacement =
      this.runtimeSessions.get(
        request.replacementRuntimeSessionId,
      );

    if (!replacement) {
      throw new Error(
        `K.I.N.G.S. Workflow Checkpoint: replacement runtime session "${request.replacementRuntimeSessionId}" was not found`,
      );
    }

    if (!replacement.active) {
      throw new Error(
        `K.I.N.G.S. Workflow Checkpoint: replacement runtime session "${request.replacementRuntimeSessionId}" is inactive`,
      );
    }

    if (
      replacement.ownerId !==
      checkpoint.ownerId
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Checkpoint: replacement runtime is not owned by checkpoint owner",
      );
    }

    checkpoint.runtimeSessionId =
      replacement.id;

    checkpoint.status =
      "active";

    checkpoint.resumeCount +=
      1;

    checkpoint.updatedAt =
      request.resumedAt;

    return {
      checkpoint:
        this.clone(
          checkpoint,
        ),
      runtime:
        this.cloneRuntime(
          replacement,
        ),
    };
  }

  complete(
    checkpointId:
      ID,
    updatedAt:
      string,
  ):
    WorkflowCheckpoint {
    const checkpoint =
      this.require(
        checkpointId,
      );

    if (
      checkpoint.status !==
      "active"
    ) {
      throw new Error(
        `K.I.N.G.S. Workflow Checkpoint: checkpoint "${checkpointId}" cannot be completed from "${checkpoint.status}"`,
      );
    }

    checkpoint.status =
      "completed";

    checkpoint.updatedAt =
      updatedAt;

    return this.clone(
      checkpoint,
    );
  }

  get(
    checkpointId:
      ID,
  ):
    WorkflowCheckpoint |
    undefined {
    const checkpoint =
      this.checkpoints.get(
        checkpointId,
      );

    return checkpoint
      ? this.clone(
          checkpoint,
        )
      : undefined;
  }

  private require(
    checkpointId:
      ID,
  ):
    WorkflowCheckpoint {
    const checkpoint =
      this.checkpoints.get(
        checkpointId,
      );

    if (!checkpoint) {
      throw new Error(
        `K.I.N.G.S. Workflow Checkpoint: checkpoint "${checkpointId}" was not found`,
      );
    }

    return checkpoint;
  }

  private clone(
    checkpoint:
      WorkflowCheckpoint,
  ):
    WorkflowCheckpoint {
    return {
      ...checkpoint,
      completedTaskIds: [
        ...checkpoint.completedTaskIds,
      ],
      pendingTaskIds: [
        ...checkpoint.pendingTaskIds,
      ],
    };
  }

  private cloneRuntime(
    runtime:
      RuntimeSession,
  ):
    RuntimeSession {
    return {
      ...runtime,
      environment: {
        ...runtime.environment,
        capabilities: [
          ...runtime.environment.capabilities,
        ],
      },
    };
  }
}
