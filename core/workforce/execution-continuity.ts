import type {
  ID,
} from "./types";

import type {
  RuntimeSessionRegistry,
  RuntimeSession,
} from "./runtime-session";

import type {
  ContextCheckpointStore,
  ContextCheckpoint,
} from "./context-checkpointing";

import type {
  MissionContinuityStore,
  MissionCheckpoint,
} from "./mission-continuity";

export type ExecutionContinuityStatus =
  | "active"
  | "paused"
  | "completed"
  | "failed";

export interface ExecutionContinuityRecord {
  id: ID;
  missionId: ID;
  taskId: ID;
  agentId: ID;

  runtimeSessionId: ID;
  runtimeDefinitionId: ID;

  contextCheckpointId?: ID;
  missionCheckpointId?: ID;

  status: ExecutionContinuityStatus;

  startedAt: string;
  updatedAt: string;
  completedAt?: string;

  resumeCount: number;
}

export interface ExecutionContinuityStartRequest {
  id: ID;
  missionId: ID;
  taskId: ID;
  agentId: ID;

  runtimeSessionId: ID;
  runtimeDefinitionId: ID;

  startedAt: string;
}

export interface ExecutionContinuityCheckpointRequest {
  executionId: ID;
  contextCheckpointId?: ID;
  missionCheckpointId?: ID;
  updatedAt: string;
}

export interface ExecutionContinuityResumeResult {
  execution: ExecutionContinuityRecord;
  runtime: RuntimeSession;
  contextCheckpoint?: ContextCheckpoint;
  missionCheckpoint?: MissionCheckpoint;
}

export class ExecutionContinuityAuthority {
  private readonly records =
    new Map<ID, ExecutionContinuityRecord>();

  constructor(
    private readonly runtimeSessions:
      RuntimeSessionRegistry,
    private readonly contextCheckpoints:
      ContextCheckpointStore,
    private readonly missionContinuity:
      MissionContinuityStore,
  ) {}

  start(
    request:
      ExecutionContinuityStartRequest,
  ): ExecutionContinuityRecord {
    if (!request.id.trim()) {
      throw new Error(
        "K.I.N.G.S. Execution Continuity: execution id is required",
      );
    }

    if (
      this.records.has(
        request.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: execution "${request.id}" already exists`,
      );
    }

    if (!request.missionId.trim()) {
      throw new Error(
        "K.I.N.G.S. Execution Continuity: mission id is required",
      );
    }

    if (!request.taskId.trim()) {
      throw new Error(
        "K.I.N.G.S. Execution Continuity: task id is required",
      );
    }

    if (!request.agentId.trim()) {
      throw new Error(
        "K.I.N.G.S. Execution Continuity: agent id is required",
      );
    }

    const runtime =
      this.runtimeSessions.get(
        request.runtimeSessionId,
      );

    if (!runtime) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: runtime session "${request.runtimeSessionId}" was not found`,
      );
    }

    if (!runtime.active) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: runtime session "${request.runtimeSessionId}" is inactive`,
      );
    }

    const record:
      ExecutionContinuityRecord = {
        id:
          request.id,
        missionId:
          request.missionId,
        taskId:
          request.taskId,
        agentId:
          request.agentId,
        runtimeSessionId:
          request.runtimeSessionId,
        runtimeDefinitionId:
          request.runtimeDefinitionId,
        status:
          "active",
        startedAt:
          request.startedAt,
        updatedAt:
          request.startedAt,
        resumeCount:
          0,
      };

    this.records.set(
      record.id,
      record,
    );

    return this.clone(
      record,
    );
  }

  checkpoint(
    request:
      ExecutionContinuityCheckpointRequest,
  ): ExecutionContinuityRecord {
    const record =
      this.require(
        request.executionId,
      );

    if (
      record.status !==
      "active"
    ) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: execution "${record.id}" is not active`,
      );
    }

    if (
      request.contextCheckpointId
    ) {
      const checkpoint =
        this.contextCheckpoints.getCheckpoint(
          request.contextCheckpointId,
        );

      if (!checkpoint) {
        throw new Error(
          `K.I.N.G.S. Execution Continuity: context checkpoint "${request.contextCheckpointId}" was not found`,
        );
      }

      if (
        checkpoint.missionId !==
          record.missionId ||
        checkpoint.taskId !==
          record.taskId
      ) {
        throw new Error(
          "K.I.N.G.S. Execution Continuity: context checkpoint does not belong to execution mission/task",
        );
      }
    }

    if (
      request.missionCheckpointId
    ) {
      const checkpoint =
        this.missionContinuity.getCheckpoint(
          request.missionCheckpointId,
        );

      if (!checkpoint) {
        throw new Error(
          `K.I.N.G.S. Execution Continuity: mission checkpoint "${request.missionCheckpointId}" was not found`,
        );
      }

      if (
        checkpoint.missionId !==
        record.missionId
      ) {
        throw new Error(
          "K.I.N.G.S. Execution Continuity: mission checkpoint does not belong to execution mission",
        );
      }
    }

    record.contextCheckpointId =
      request.contextCheckpointId;

    record.missionCheckpointId =
      request.missionCheckpointId;

    record.updatedAt =
      request.updatedAt;

    return this.clone(
      record,
    );
  }

  pause(
    executionId:
      ID,
    updatedAt:
      string,
  ): ExecutionContinuityRecord {
    const record =
      this.require(
        executionId,
      );

    if (
      record.status !==
      "active"
    ) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: execution "${executionId}" cannot be paused from "${record.status}"`,
      );
    }

    record.status =
      "paused";
    record.updatedAt =
      updatedAt;

    return this.clone(
      record,
    );
  }

  resume(
    executionId:
      ID,
    runtimeSessionId:
      ID,
    updatedAt:
      string,
  ): ExecutionContinuityResumeResult {
    const record =
      this.require(
        executionId,
      );

    if (
      record.status !==
      "paused"
    ) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: execution "${executionId}" cannot be resumed from "${record.status}"`,
      );
    }

    const runtime =
      this.runtimeSessions.get(
        runtimeSessionId,
      );

    if (!runtime) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: runtime session "${runtimeSessionId}" was not found`,
      );
    }

    if (!runtime.active) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: runtime session "${runtimeSessionId}" is inactive`,
      );
    }

    if (
      runtime.ownerId !==
      this.requireRuntimeOwner(
        record.runtimeSessionId,
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Execution Continuity: resumed runtime is not owned by the same owner",
      );
    }

    const contextCheckpoint =
      record.contextCheckpointId
        ? this.contextCheckpoints.getCheckpoint(
            record.contextCheckpointId,
          )
        : undefined;

    const missionCheckpoint =
      record.missionCheckpointId
        ? this.missionContinuity.getCheckpoint(
            record.missionCheckpointId,
          )
        : undefined;

    record.runtimeSessionId =
      runtimeSessionId;
    record.status =
      "active";
    record.resumeCount +=
      1;
    record.updatedAt =
      updatedAt;

    return {
      execution:
        this.clone(
          record,
        ),
      runtime:
        this.cloneRuntime(
          runtime,
        ),
      contextCheckpoint,
      missionCheckpoint,
    };
  }

  complete(
    executionId:
      ID,
    updatedAt:
      string,
  ): ExecutionContinuityRecord {
    const record =
      this.require(
        executionId,
      );

    if (
      record.status !==
      "active"
    ) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: execution "${executionId}" cannot be completed from "${record.status}"`,
      );
    }

    record.status =
      "completed";
    record.updatedAt =
      updatedAt;
    record.completedAt =
      updatedAt;

    return this.clone(
      record,
    );
  }

  fail(
    executionId:
      ID,
    updatedAt:
      string,
  ): ExecutionContinuityRecord {
    const record =
      this.require(
        executionId,
      );

    if (
      record.status !==
      "active"
    ) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: execution "${executionId}" cannot be failed from "${record.status}"`,
      );
    }

    record.status =
      "failed";
    record.updatedAt =
      updatedAt;

    return this.clone(
      record,
    );
  }

  get(
    executionId:
      ID,
  ):
    ExecutionContinuityRecord |
    undefined {
    const record =
      this.records.get(
        executionId,
      );

    return record
      ? this.clone(
          record,
        )
      : undefined;
  }

  listForTask(
    missionId:
      ID,
    taskId:
      ID,
  ):
    ExecutionContinuityRecord[] {
    return [
      ...this.records.values(),
    ]
      .filter(
        (record) =>
          record.missionId ===
            missionId &&
          record.taskId ===
            taskId,
      )
      .map(
        (record) =>
          this.clone(
            record,
          ),
      );
  }

  private require(
    executionId:
      ID,
  ): ExecutionContinuityRecord {
    const record =
      this.records.get(
        executionId,
      );

    if (!record) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: execution "${executionId}" was not found`,
      );
    }

    return record;
  }

  private requireRuntimeOwner(
    runtimeSessionId:
      ID,
  ): ID {
    const runtime =
      this.runtimeSessions.get(
        runtimeSessionId,
      );

    if (!runtime) {
      throw new Error(
        `K.I.N.G.S. Execution Continuity: runtime session "${runtimeSessionId}" was not found`,
      );
    }

    return runtime.ownerId;
  }

  private clone(
    record:
      ExecutionContinuityRecord,
  ):
    ExecutionContinuityRecord {
    return {
      ...record,
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
