import type {
  ID,
} from "./types";

import type {
  ProjectBrainStateSnapshot,
  ProjectBrainStateQuery,
} from "./project-brain-state";

import {
  ProjectBrainStateAuthority,
} from "./project-brain-state";

import type {
  ProjectBrainStateRecord,
  ProjectBrainStateQuery as StoreQuery,
} from "./project-brain-state-store";

import {
  ProjectBrainStateStore,
} from "./project-brain-state-store";

export interface ProjectBrainStatePersistenceResult {
  record: ProjectBrainStateRecord;
  snapshot: ProjectBrainStateSnapshot;
}

export class ProjectBrainStatePersistence {
  constructor(
    private readonly authority:
      ProjectBrainStateAuthority,
    private readonly store:
      ProjectBrainStateStore,
  ) {}

  captureAndPersist(
    query:
      ProjectBrainStateQuery,
    persistedAt?: string,
  ): ProjectBrainStatePersistenceResult {
    const snapshot =
      this.authority.snapshot(
        query,
      );

    const record =
      this.store.persist(
        snapshot,
        persistedAt,
      );

    return {
      record,
      snapshot,
    };
  }

  persistSnapshot(
    snapshot:
      ProjectBrainStateSnapshot,
    persistedAt?: string,
  ): ProjectBrainStateRecord {
    return this.store.persist(
      snapshot,
      persistedAt,
    );
  }

  restore(
    snapshotId: ID,
  ): ProjectBrainStateSnapshot {
    return this.store.restore(
      snapshotId,
    );
  }

  latest(
    missionId: ID,
  ):
    | ProjectBrainStateRecord
    | undefined {
    return this.store.latest(
      missionId,
    );
  }

  list(
    query:
      StoreQuery = {},
  ): ProjectBrainStateRecord[] {
    return this.store.list(
      query,
    );
  }
}
