import type {
  ID,
} from "./types";

import type {
  MissionCheckpoint,
  MissionState,
} from "./mission-continuity";

import {
  MissionContinuityStore,
} from "./mission-continuity";

export interface ProjectBrainCheckpointQuery {
  missionId: ID;
  limit?: number;
}

export class ProjectBrainCheckpointAdapter {
  constructor(
    private readonly continuity:
      MissionContinuityStore,
  ) {}

  create(
    checkpoint:
      MissionCheckpoint,
  ): MissionCheckpoint {
    return this.continuity.createCheckpoint(
      checkpoint,
    );
  }

  get(
    checkpointId: ID,
  ):
    | MissionCheckpoint
    | undefined {
    return this.continuity.getCheckpoint(
      checkpointId,
    );
  }

  latest(
    missionId: ID,
  ):
    | MissionCheckpoint
    | undefined {
    return this.continuity.getLatestCheckpoint(
      missionId,
    );
  }

  restoreLatest(
    missionId: ID,
  ): MissionState {
    return this.continuity.restoreLatestCheckpoint(
      missionId,
    );
  }

  list(
    query:
      ProjectBrainCheckpointQuery,
  ): MissionCheckpoint[] {
    if (
      !Number.isInteger(
        query.limit,
      ) &&
      query.limit !== undefined
    ) {
      throw new Error(
        "K.I.N.G.S. Project Brain Checkpoint Adapter: limit must be a non-negative integer",
      );
    }

    if (
      query.limit !== undefined &&
      query.limit < 0
    ) {
      throw new Error(
        "K.I.N.G.S. Project Brain Checkpoint Adapter: limit must be a non-negative integer",
      );
    }

    /*
     * MissionContinuity is authoritative.
     * The adapter deliberately does not maintain its own
     * checkpoint collection or latest-checkpoint pointer.
     */
    const latest =
      this.continuity.getLatestCheckpoint(
        query.missionId,
      );

    if (!latest) {
      return [];
    }

    if (
      query.limit === 0
    ) {
      return [];
    }

    /*
     * MissionContinuity currently exposes latest-checkpoint
     * access rather than a public historical list. Therefore
     * the adapter exposes the authoritative latest checkpoint
     * without inventing a second history store.
     */
    return [
      latest,
    ];
  }

  clear(): void {
    /*
     * Checkpoints belong to MissionContinuity.
     * The adapter intentionally does not clear the underlying
     * continuity store because doing so would also erase mission,
     * plan, state, and decision authority.
     */
  }
}
