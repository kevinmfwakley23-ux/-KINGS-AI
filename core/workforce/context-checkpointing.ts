import type {
  ID,
} from "./types";

import type {
  MissionExecutionContext,
} from "./execution/mission-execution-context";

export interface ContextCheckpoint {
  id: ID;
  missionId: ID;
  taskId: ID;
  context: MissionExecutionContext;
  missionCheckpointId?: ID;
  reason: string;
  sequence: number;
  createdAt: string;
}

export interface ContextCheckpointSnapshot {
  missionId: ID;
  taskId: ID;
  latest?: ContextCheckpoint;
  count: number;
}

export class ContextCheckpointStore {
  private readonly checkpoints =
    new Map<ID, ContextCheckpoint>();

  private readonly sequences =
    new Map<ID, number>();

  createCheckpoint(
    checkpoint: ContextCheckpoint,
  ): ContextCheckpoint {
    if (!checkpoint.id) {
      throw new Error(
        "K.I.N.G.S. Context Checkpoint: checkpoint id is required",
      );
    }

    if (!checkpoint.missionId) {
      throw new Error(
        "K.I.N.G.S. Context Checkpoint: mission id is required",
      );
    }

    if (!checkpoint.taskId) {
      throw new Error(
        "K.I.N.G.S. Context Checkpoint: task id is required",
      );
    }

    if (
      checkpoint.context.missionId !==
      checkpoint.missionId
    ) {
      throw new Error(
        "K.I.N.G.S. Context Checkpoint: context mission does not match checkpoint mission",
      );
    }

    if (
      checkpoint.context.taskId !==
      checkpoint.taskId
    ) {
      throw new Error(
        "K.I.N.G.S. Context Checkpoint: context task does not match checkpoint task",
      );
    }

    if (!checkpoint.reason.trim()) {
      throw new Error(
        "K.I.N.G.S. Context Checkpoint: checkpoint reason is required",
      );
    }

    if (
      this.checkpoints.has(checkpoint.id)
    ) {
      throw new Error(
        `K.I.N.G.S. Context Checkpoint: duplicate checkpoint id "${checkpoint.id}"`,
      );
    }

    const currentSequence =
      this.sequences.get(
        checkpoint.taskId,
      ) ?? 0;

    const sequence =
      currentSequence + 1;

    const stored: ContextCheckpoint = {
      ...checkpoint,
      sequence,
      context:
        this.cloneContext(
          checkpoint.context,
        ),
    };

    this.checkpoints.set(
      checkpoint.id,
      stored,
    );

    this.sequences.set(
      checkpoint.taskId,
      sequence,
    );

    return this.cloneCheckpoint(
      stored,
    );
  }

  getCheckpoint(
    checkpointId: ID,
  ): ContextCheckpoint | undefined {
    const checkpoint =
      this.checkpoints.get(
        checkpointId,
      );

    return checkpoint
      ? this.cloneCheckpoint(
          checkpoint,
        )
      : undefined;
  }

  getLatestCheckpoint(
    missionId: ID,
    taskId: ID,
  ): ContextCheckpoint | undefined {
    const checkpoints =
      [
        ...this.checkpoints.values(),
      ]
        .filter(
          (checkpoint) =>
            checkpoint.missionId ===
              missionId &&
            checkpoint.taskId ===
              taskId,
        )
        .sort(
          (a, b) =>
            a.sequence -
            b.sequence,
        );

    const latest =
      checkpoints[
        checkpoints.length - 1
      ];

    return latest
      ? this.cloneCheckpoint(
          latest,
        )
      : undefined;
  }

  restoreLatestCheckpoint(
    missionId: ID,
    taskId: ID,
  ): MissionExecutionContext {
    const checkpoint =
      this.getLatestCheckpoint(
        missionId,
        taskId,
      );

    if (!checkpoint) {
      throw new Error(
        `K.I.N.G.S. Context Checkpoint: task "${taskId}" has no checkpoint to restore`,
      );
    }

    return this.cloneContext(
      checkpoint.context,
    );
  }

  snapshot(
    missionId: ID,
    taskId: ID,
  ): ContextCheckpointSnapshot {
    return {
      missionId,
      taskId,
      latest:
        this.getLatestCheckpoint(
          missionId,
          taskId,
        ),
      count:
        [
          ...this.checkpoints.values(),
        ].filter(
          (checkpoint) =>
            checkpoint.missionId ===
              missionId &&
            checkpoint.taskId ===
              taskId,
        ).length,
    };
  }

  clear(): void {
    this.checkpoints.clear();
    this.sequences.clear();
  }

  private cloneCheckpoint(
    checkpoint: ContextCheckpoint,
  ): ContextCheckpoint {
    return {
      ...checkpoint,
      context:
        this.cloneContext(
          checkpoint.context,
        ),
    };
  }

  private cloneContext(
    context: MissionExecutionContext,
  ): MissionExecutionContext {
    return {
      ...context,
      memories: [
        ...context.memories,
      ],
      knowledge:
        context.knowledge
          ? {
              ...context.knowledge,
              records: [
                ...context.knowledge.records,
              ],
              evidence: [
                ...context.knowledge.evidence,
              ],
              sourceIds: [
                ...context.knowledge.sourceIds,
              ],
            }
          : undefined,
    };
  }
}
