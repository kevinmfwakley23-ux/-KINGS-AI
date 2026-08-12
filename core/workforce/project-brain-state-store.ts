import type {
  ID,
} from "./types";

import type {
  ProjectBrainStateSnapshot,
} from "./project-brain-state";

export interface ProjectBrainStateRecord {
  id: ID;
  missionId: ID;
  snapshot: ProjectBrainStateSnapshot;
  snapshotHash: string;
  persistedAt: string;
}

export interface ProjectBrainStateQuery {
  missionId?: ID;
  limit?: number;
}

export class ProjectBrainStateStore {
  private readonly records =
    new Map<
      ID,
      ProjectBrainStateRecord
    >();

  persist(
    snapshot: ProjectBrainStateSnapshot,
    persistedAt =
      new Date().toISOString(),
  ): ProjectBrainStateRecord {
    if (
      !snapshot.missionId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Project Brain State Store: mission id is required",
      );
    }

    const id =
      this.createRecordId(
        snapshot,
      );

    if (
      this.records.has(id)
    ) {
      throw new Error(
        `K.I.N.G.S. Project Brain State Store: duplicate snapshot "${id}"`,
      );
    }

    const record:
      ProjectBrainStateRecord =
      {
        id,
        missionId:
          snapshot.missionId,
        snapshot:
          this.cloneSnapshot(
            snapshot,
          ),
        snapshotHash:
          this.hashSnapshot(
            snapshot,
          ),
        persistedAt,
      };

    this.records.set(
      id,
      record,
    );

    return this.cloneRecord(
      record,
    );
  }

  get(
    id: ID,
  ):
    | ProjectBrainStateRecord
    | undefined {
    const record =
      this.records.get(id);

    return record
      ? this.cloneRecord(
          record,
        )
      : undefined;
  }

  latest(
    missionId: ID,
  ):
    | ProjectBrainStateRecord
    | undefined {
    const matches =
      this.list({
        missionId,
      });

    return matches.length > 0
      ? matches[
          matches.length - 1
        ]
      : undefined;
  }

  list(
    query:
      ProjectBrainStateQuery = {},
  ): ProjectBrainStateRecord[] {
    if (
      query.limit !== undefined &&
      (
        !Number.isInteger(
          query.limit,
        ) ||
        query.limit < 0
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Project Brain State Store: limit must be a non-negative integer",
      );
    }

    const records =
      [
        ...this.records.values(),
      ]
        .filter(
          (record) =>
            query.missionId ===
              undefined ||
            record.missionId ===
              query.missionId,
        )
        .sort(
          (a, b) =>
            this.compare(
              a.id,
              b.id,
            ),
        )
        .map(
          (record) =>
            this.cloneRecord(
              record,
            ),
        );

    if (
      query.limit === undefined
    ) {
      return records;
    }

    return records.slice(
      0,
      query.limit,
    );
  }

  restore(
    id: ID,
  ): ProjectBrainStateSnapshot {
    const record =
      this.records.get(id);

    if (!record) {
      throw new Error(
        `K.I.N.G.S. Project Brain State Store: unknown snapshot "${id}"`,
      );
    }

    const calculated =
      this.hashSnapshot(
        record.snapshot,
      );

    if (
      calculated !==
      record.snapshotHash
    ) {
      throw new Error(
        `K.I.N.G.S. Project Brain State Store: snapshot integrity failure "${id}"`,
      );
    }

    return this.cloneSnapshot(
      record.snapshot,
    );
  }

  clear(): void {
    this.records.clear();
  }

  private createRecordId(
    snapshot:
      ProjectBrainStateSnapshot,
  ): ID {
    return [
      snapshot.missionId,
      snapshot.createdAt,
      this.hashSnapshot(
        snapshot,
      ),
    ].join(":");
  }

  private hashSnapshot(
    snapshot:
      ProjectBrainStateSnapshot,
  ): string {
    const canonical =
      JSON.stringify(
        snapshot,
      );

    let hash =
      2166136261;

    for (
      let index = 0;
      index < canonical.length;
      index += 1
    ) {
      hash ^=
        canonical.charCodeAt(
          index,
        );

      hash =
        Math.imul(
          hash,
          16777619,
        );
    }

    return (
      hash >>> 0
    )
      .toString(16)
      .padStart(
        8,
        "0",
      );
  }

  private cloneSnapshot(
    snapshot:
      ProjectBrainStateSnapshot,
  ):
    ProjectBrainStateSnapshot {
    return JSON.parse(
      JSON.stringify(
        snapshot,
      ),
    ) as ProjectBrainStateSnapshot;
  }

  private cloneRecord(
    record:
      ProjectBrainStateRecord,
  ):
    ProjectBrainStateRecord {
    return {
      id:
        record.id,
      missionId:
        record.missionId,
      snapshot:
        this.cloneSnapshot(
          record.snapshot,
        ),
      snapshotHash:
        record.snapshotHash,
      persistedAt:
        record.persistedAt,
    };
  }

  private compare(
    a: string,
    b: string,
  ): number {
    if (a === b) {
      return 0;
    }

    return a < b
      ? -1
      : 1;
  }
}
