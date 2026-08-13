import type {
  MemoryReference,
} from "./types";

export type ProjectMemoryLifecycleState =
  | "active"
  | "snapshot-ready"
  | "snapshotted"
  | "released";

export interface ProjectLearningSnapshot {
  projectId:
    string;

  snapshotId:
    string;

  projectName:
    string;

  objective:
    string;

  memoryCount:
    number;

  importantMemoryIds:
    string[];

  lessonMemoryIds:
    string[];

  reusableProcedureIds:
    string[];

  failedApproachMemoryIds:
    string[];

  preservedHistoryReferences:
    string[];

  createdAt:
    string;
}

export interface ProjectMemoryLifecycleRecord {
  projectId:
    string;

  state:
    ProjectMemoryLifecycleState;

  activeMemoryIds:
    string[];

  snapshotId?:
    string;

  releasedAt?:
    string;
}

export interface ProjectCompletionRequest {
  projectId:
    string;

  projectName:
    string;

  objective:
    string;

  completedAt:
    string;

  memories:
    MemoryReference[];

  importantMemoryIds:
    string[];

  lessonMemoryIds:
    string[];

  reusableProcedureIds:
    string[];

  failedApproachMemoryIds:
    string[];
}

export class ProjectMemoryLifecycleAuthority {
  private readonly records =
    new Map<
      string,
      ProjectMemoryLifecycleRecord
    >();

  private readonly snapshots =
    new Map<
      string,
      ProjectLearningSnapshot
    >();

  prepareCompletion(
    request:
      ProjectCompletionRequest,
  ):
    ProjectMemoryLifecycleRecord {
    this.validateCompletionRequest(
      request,
    );

    const existing =
      this.records.get(
        request.projectId,
      );

    if (
      existing &&
      (
        existing.state ===
          "snapshotted" ||
        existing.state ===
          "released"
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Project Memory: project "${request.projectId}" already passed completion`,
      );
    }

    const record:
      ProjectMemoryLifecycleRecord = {
      projectId:
        request.projectId,

      state:
        "snapshot-ready",

      activeMemoryIds:
        request.memories.map(
          (
            memory,
          ) =>
            memory.id,
        ),
    };

    this.records.set(
      request.projectId,
      record,
    );

    return {
      ...record,
      activeMemoryIds:
        [
          ...record.activeMemoryIds,
        ],
    };
  }

  createSnapshot(
    request:
      ProjectCompletionRequest,
  ):
    ProjectLearningSnapshot {
    const record =
      this.records.get(
        request.projectId,
      );

    if (
      !record ||
      record.state !==
        "snapshot-ready"
    ) {
      throw new Error(
        `K.I.N.G.S. Project Memory: project "${request.projectId}" is not ready for snapshot creation`,
      );
    }

    const snapshotId =
      `project-snapshot-${request.projectId}`;

    const snapshot:
      ProjectLearningSnapshot = {
      projectId:
        request.projectId,

      snapshotId,

      projectName:
        request.projectName,

      objective:
        request.objective,

      memoryCount:
        request.memories.length,

      importantMemoryIds:
        this.uniqueExistingIds(
          request.importantMemoryIds,
          request.memories,
        ),

      lessonMemoryIds:
        this.uniqueExistingIds(
          request.lessonMemoryIds,
          request.memories,
        ),

      reusableProcedureIds:
        this.uniqueExistingIds(
          request.reusableProcedureIds,
          request.memories,
        ),

      failedApproachMemoryIds:
        this.uniqueExistingIds(
          request.failedApproachMemoryIds,
          request.memories,
        ),

      preservedHistoryReferences:
        this.unique(
          request.memories.flatMap(
            (
              memory,
            ) =>
              memory.sourceReferences,
          ),
        ),

      createdAt:
        request.completedAt,
    };

    this.snapshots.set(
      snapshotId,
      snapshot,
    );

    this.records.set(
      request.projectId,
      {
        ...record,

        state:
          "snapshotted",

        snapshotId:
          snapshot.snapshotId,
      },
    );

    return {
      ...snapshot,

      importantMemoryIds:
        [
          ...snapshot.importantMemoryIds,
        ],

      lessonMemoryIds:
        [
          ...snapshot.lessonMemoryIds,
        ],

      reusableProcedureIds:
        [
          ...snapshot.reusableProcedureIds,
        ],

      failedApproachMemoryIds:
        [
          ...snapshot.failedApproachMemoryIds,
        ],

      preservedHistoryReferences:
        [
          ...snapshot.preservedHistoryReferences,
        ],
    };
  }

  releaseActiveMemory(
    projectId:
      string,
    releasedAt:
      string,
  ):
    ProjectMemoryLifecycleRecord {
    const record =
      this.records.get(
        projectId,
      );

    if (
      !record
    ) {
      throw new Error(
        `K.I.N.G.S. Project Memory: project "${projectId}" is not registered`,
      );
    }

    if (
      record.state !==
        "snapshotted"
    ) {
      throw new Error(
        `K.I.N.G.S. Project Memory: project "${projectId}" cannot release active memory before snapshot verification`,
      );
    }

    const released:
      ProjectMemoryLifecycleRecord = {
      ...record,

      state:
        "released",

      activeMemoryIds:
        [],

      releasedAt,
    };

    this.records.set(
      projectId,
      released,
    );

    return {
      ...released,

      activeMemoryIds: [],
    };
  }

  verifySnapshot(
    projectId:
      string,
  ):
    ProjectLearningSnapshot {
    const record =
      this.records.get(
        projectId,
      );

    if (
      !record?.snapshotId
    ) {
      throw new Error(
        `K.I.N.G.S. Project Memory: project "${projectId}" has no verified snapshot`,
      );
    }

    const snapshot =
      this.snapshots.get(
        record.snapshotId,
      );

    if (
      !snapshot
    ) {
      throw new Error(
        `K.I.N.G.S. Project Memory: snapshot "${record.snapshotId}" is missing`,
      );
    }

    return {
      ...snapshot,

      importantMemoryIds:
        [
          ...snapshot.importantMemoryIds,
        ],

      lessonMemoryIds:
        [
          ...snapshot.lessonMemoryIds,
        ],

      reusableProcedureIds:
        [
          ...snapshot.reusableProcedureIds,
        ],

      failedApproachMemoryIds:
        [
          ...snapshot.failedApproachMemoryIds,
        ],

      preservedHistoryReferences:
        [
          ...snapshot.preservedHistoryReferences,
        ],
    };
  }

  getState(
    projectId:
      string,
  ):
    ProjectMemoryLifecycleRecord |
    undefined {
    const record =
      this.records.get(
        projectId,
      );

    return record
      ? {
          ...record,

          activeMemoryIds:
            [
              ...record.activeMemoryIds,
            ],
        }
      : undefined;
  }

  private validateCompletionRequest(
    request:
      ProjectCompletionRequest,
  ):
    void {
    if (
      !request.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Project Memory: project id is required",
      );
    }

    if (
      !request.projectName.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Project Memory: project name is required",
      );
    }

    if (
      !request.objective.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Project Memory: project objective is required",
      );
    }

    if (
      !request.completedAt
    ) {
      throw new Error(
        "K.I.N.G.S. Project Memory: completedAt is required",
      );
    }

    for (
      const memory of request.memories
    ) {
      if (
        !memory.id
      ) {
        throw new Error(
          "K.I.N.G.S. Project Memory: every memory must have an id",
        );
      }

      if (
        memory.sourceReferences.length ===
        0
      ) {
        throw new Error(
          `K.I.N.G.S. Project Memory: memory "${memory.id}" requires provenance`,
        );
      }
    }
  }

  private unique(
    values:
      string[],
  ):
    string[] {
    return [
      ...new Set(
        values,
      ),
    ];
  }

  private uniqueExistingIds(
    ids:
      string[],
    memories:
      MemoryReference[],
  ):
    string[] {
    const existing =
      new Set(
        memories.map(
          (
            memory,
          ) =>
            memory.id,
        ),
      );

    return this.unique(
      ids.filter(
        (
          id,
        ) =>
          existing.has(
            id,
          ),
      ),
    );
  }
}
