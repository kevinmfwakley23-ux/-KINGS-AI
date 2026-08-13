import type {
  MemoryReference,
} from "./types";

export interface MemoryContextIdentity {
  memoryId:
    string;

  createdAt:
    string;

  updatedAt:
    string;

  missionId?:
    string;

  taskId?:
    string;

  sourceReferences:
    string[];

  authoritative:
    boolean;

  hasMissionContext:
    boolean;

  hasTaskContext:
    boolean;

  hasProvenance:
    boolean;
}

export class MemoryContextAuthority {
  inspect(
    memory:
      MemoryReference,
  ):
    MemoryContextIdentity {
    if (!memory.id) {
      throw new Error(
        "K.I.N.G.S. Memory Context: memory id is required",
      );
    }

    if (!memory.createdAt) {
      throw new Error(
        `K.I.N.G.S. Memory Context: memory "${memory.id}" requires createdAt`,
      );
    }

    if (!memory.updatedAt) {
      throw new Error(
        `K.I.N.G.S. Memory Context: memory "${memory.id}" requires updatedAt`,
      );
    }

    if (
      memory.sourceReferences.length ===
      0
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Context: memory "${memory.id}" requires provenance`,
      );
    }

    return {
      memoryId:
        memory.id,

      createdAt:
        memory.createdAt,

      updatedAt:
        memory.updatedAt,

      missionId:
        memory.missionId,

      taskId:
        memory.taskId,

      sourceReferences:
        [...memory.sourceReferences],

      authoritative:
        memory.authoritative,

      hasMissionContext:
        Boolean(
          memory.missionId,
        ),

      hasTaskContext:
        Boolean(
          memory.taskId,
        ),

      hasProvenance:
        memory.sourceReferences.length >
        0,
    };
  }

  isContextSpecific(
    memory:
      MemoryReference,
  ):
    boolean {
    return Boolean(
      memory.missionId ||
      memory.taskId,
    );
  }

  isProjectPortable(
    memory:
      MemoryReference,
  ):
    boolean {
    return (
      !memory.missionId &&
      !memory.taskId
    );
  }
}
