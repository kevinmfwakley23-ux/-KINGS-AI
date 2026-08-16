import type {
  ID,
} from "./types";

export type WorkUnitExecutionStatus =
  | "pending"
  | "reasoning"
  | "coding"
  | "verifying"
  | "blocked"
  | "completed"
  | "failed";

export interface WorkUnitExecutionState {
  workUnitId:
    ID;

  missionId:
    ID;

  status:
    WorkUnitExecutionStatus;

  attempt:
    number;

  startedAt?:
    string;

  completedAt?:
    string;

  targetPath:
    string;

  reasoningCaptured:
    boolean;

  codingStarted:
    boolean;

  verificationPassed:
    boolean;

  evidence:
    readonly string[];

  reasons:
    readonly string[];

  lastCheckpointAt:
    string;
}

export interface WorkUnitExecutionCheckpoint {
  checkpointId:
    ID;

  state:
    WorkUnitExecutionState;
}

export class WorkUnitExecutionStateStore {
  private readonly states =
    new Map<
      ID,
      WorkUnitExecutionCheckpoint
    >();

  start(
    workUnitId: ID,
    missionId: ID,
    targetPath: string,
  ): WorkUnitExecutionState {
    const now =
      new Date().toISOString();

    const previous =
      this.states.get(
        workUnitId,
      );

    const state: WorkUnitExecutionState = {
      workUnitId,
      missionId,
      status:
        "reasoning",
      attempt:
        (previous?.state.attempt ?? 0) + 1,
      startedAt:
        now,
      targetPath,
      reasoningCaptured:
        false,
      codingStarted:
        false,
      verificationPassed:
        false,
      evidence:
        previous?.state.evidence ?? [],
      reasons: [],
      lastCheckpointAt:
        now,
    };

    return this.persist(
      state,
    );
  }

  markReasoningCaptured(
    state: WorkUnitExecutionState,
    evidence: readonly string[],
  ): WorkUnitExecutionState {
    return this.persist({
      ...state,
      status:
        "coding",
      reasoningCaptured:
        true,
      evidence: [
        ...state.evidence,
        ...evidence,
      ],
      lastCheckpointAt:
        new Date().toISOString(),
    });
  }

  markCodingStarted(
    state: WorkUnitExecutionState,
  ): WorkUnitExecutionState {
    return this.persist({
      ...state,
      status:
        "verifying",
      codingStarted:
        true,
      lastCheckpointAt:
        new Date().toISOString(),
    });
  }

  markVerified(
    state: WorkUnitExecutionState,
    evidence: readonly string[],
  ): WorkUnitExecutionState {
    return this.persist({
      ...state,
      status:
        "completed",
      verificationPassed:
        true,
      completedAt:
        new Date().toISOString(),
      evidence: [
        ...state.evidence,
        ...evidence,
      ],
      lastCheckpointAt:
        new Date().toISOString(),
    });
  }

  block(
    state: WorkUnitExecutionState,
    reasons: readonly string[],
    evidence: readonly string[] = [],
  ): WorkUnitExecutionState {
    return this.persist({
      ...state,
      status:
        "blocked",
      reasons: [
        ...state.reasons,
        ...reasons,
      ],
      evidence: [
        ...state.evidence,
        ...evidence,
      ],
      lastCheckpointAt:
        new Date().toISOString(),
    });
  }

  fail(
    state: WorkUnitExecutionState,
    reasons: readonly string[],
  ): WorkUnitExecutionState {
    return this.persist({
      ...state,
      status:
        "failed",
      reasons: [
        ...state.reasons,
        ...reasons,
      ],
      lastCheckpointAt:
        new Date().toISOString(),
    });
  }

  get(
    workUnitId: ID,
  ):
    WorkUnitExecutionState | undefined {
    return this.states.get(
      workUnitId,
    )?.state;
  }

  snapshot():
    readonly WorkUnitExecutionState[] {
    return Array.from(
      this.states.values(),
      (
        checkpoint,
      ) =>
        checkpoint.state,
    );
  }

  private persist(
    state: WorkUnitExecutionState,
  ): WorkUnitExecutionState {
    const checkpoint: WorkUnitExecutionCheckpoint = {
      checkpointId:
        `CHECKPOINT-${state.workUnitId}-${Date.now()}`,
      state,
    };

    this.states.set(
      state.workUnitId,
      checkpoint,
    );

    return state;
  }
}
