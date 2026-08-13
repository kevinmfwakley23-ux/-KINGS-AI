import type {
  MemoryReference,
} from "./types";

export type SupersessionStatus =
  | "current"
  | "superseded";

export interface MemorySupersessionRecord {
  memoryId:
    string;

  status:
    SupersessionStatus;

  supersededBy?:
    string;

  reason?:
    string;

  changedAt:
    string;

  preserved:
    boolean;
}

export interface MemoryCurrentTruthResult {
  memoryId:
    string;

  isCurrent:
    boolean;

  reason:
    string;
}

export class MemorySupersessionAuthority {
  private readonly records =
    new Map<
      string,
      MemorySupersessionRecord
    >();

  register(
    memory:
      MemoryReference,
  ):
    MemorySupersessionRecord {
    if (!memory.id) {
      throw new Error(
        "K.I.N.G.S. Memory Supersession: memory id is required",
      );
    }

    const existing =
      this.records.get(
        memory.id,
      );

    if (
      existing
    ) {
      return {
        ...existing,
      };
    }

    const record:
      MemorySupersessionRecord = {
      memoryId:
        memory.id,

      status:
        "current",

      changedAt:
        memory.updatedAt,

      preserved:
        true,
    };

    this.records.set(
      memory.id,
      record,
    );

    return {
      ...record,
    };
  }

  supersede(
    memory:
      MemoryReference,
    supersededBy:
      MemoryReference,
    reason:
      string,
    changedAt:
      string,
  ):
    MemorySupersessionRecord {
    if (
      memory.id ===
      supersededBy.id
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Supersession: memory "${memory.id}" cannot supersede itself`,
      );
    }

    if (
      !reason.trim()
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Supersession: reason is required when superseding "${memory.id}"`,
      );
    }

    if (
      !changedAt
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Supersession: changedAt is required`,
      );
    }

    const predecessor =
      this.register(
        memory,
      );

    const successor =
      this.register(
        supersededBy,
      );

    if (
      successor.status ===
      "superseded"
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Supersession: successor "${supersededBy.id}" is already superseded`,
      );
    }

    if (
      predecessor.status ===
      "superseded"
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Supersession: memory "${memory.id}" is already superseded`,
      );
    }

    const updated:
      MemorySupersessionRecord = {
      memoryId:
        memory.id,

      status:
        "superseded",

      supersededBy:
        supersededBy.id,

      reason:
        reason.trim(),

      changedAt,

      preserved:
        true,
    };

    this.records.set(
      memory.id,
      updated,
    );

    return {
      ...updated,
    };
  }

  currentTruth(
    memoryId:
      string,
  ):
    MemoryCurrentTruthResult {
    const record =
      this.records.get(
        memoryId,
      );

    if (
      !record
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Supersession: memory "${memoryId}" is not registered`,
      );
    }

    if (
      record.status ===
      "superseded"
    ) {
      return {
        memoryId,
        isCurrent:
          false,
        reason:
          `Superseded by "${record.supersededBy}"`,
      };
    }

    return {
      memoryId,
      isCurrent:
        true,
      reason:
        "Memory is current.",
    };
  }

  get(
    memoryId:
      string,
  ):
    MemorySupersessionRecord |
    undefined {
    const record =
      this.records.get(
        memoryId,
      );

    return record
      ? {
          ...record,
        }
      : undefined;
  }

  all():
    MemorySupersessionRecord[] {
    return [
      ...this.records.values(),
    ].map(
      (
        record,
      ) => ({
        ...record,
      }),
    );
  }
}
