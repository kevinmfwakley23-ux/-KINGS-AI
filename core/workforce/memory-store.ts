import type {
  ID,
  MemoryReference,
  MemoryType,
} from "./types";

export interface MemoryStoreQuery {
  type?: MemoryType;
  authoritativeOnly?: boolean;
  missionId?: ID;
  taskId?: ID;
  agentId?: ID;
  limit?: number;
}

export class MemoryStore {
  private readonly memories =
    new Map<ID, MemoryReference>();

  register(
    memory: MemoryReference,
  ): void {
    if (!memory.id) {
      throw new Error(
        "K.I.N.G.S. Memory Store: memory id is required",
      );
    }

    if (!memory.summary.trim()) {
      throw new Error(
        `K.I.N.G.S. Memory Store: memory "${memory.id}" requires a summary`,
      );
    }

    if (
      memory.authoritative &&
      memory.sourceReferences.length === 0
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Store: authoritative memory "${memory.id}" requires provenance`,
      );
    }

    if (
      this.memories.has(memory.id)
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Store: duplicate memory id "${memory.id}"`,
      );
    }

    this.memories.set(
      memory.id,
      memory,
    );
  }

  get(
    memoryId: ID,
  ): MemoryReference | undefined {
    return this.memories.get(
      memoryId,
    );
  }

  list(): MemoryReference[] {
    return [
      ...this.memories.values(),
    ];
  }

  query(
    query: MemoryStoreQuery = {},
  ): MemoryReference[] {
    const limit = Math.max(
      1,
      query.limit ?? Number.MAX_SAFE_INTEGER,
    );

    return this.list()
      .filter((memory) => {
        if (
          query.type &&
          memory.type !== query.type
        ) {
          return false;
        }

        if (
          query.authoritativeOnly &&
          !memory.authoritative
        ) {
          return false;
        }

        if (
          query.missionId &&
          memory.missionId !==
            query.missionId
        ) {
          return false;
        }

        if (
          query.taskId &&
          memory.taskId !==
            query.taskId
        ) {
          return false;
        }

        if (
          query.agentId &&
          memory.agentId !==
            query.agentId
        ) {
          return false;
        }

        return true;
      })
      .slice(0, limit);
  }

  promote(
    memoryId: ID,
  ): MemoryReference {
    const memory =
      this.get(memoryId);

    if (!memory) {
      throw new Error(
        `K.I.N.G.S. Memory Store: memory "${memoryId}" not found`,
      );
    }

    if (
      memory.sourceReferences.length === 0
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Store: memory "${memoryId}" cannot become authoritative without provenance`,
      );
    }

    const promoted: MemoryReference = {
      ...memory,
      authoritative: true,
      updatedAt:
        new Date().toISOString(),
    };

    this.memories.set(
      memoryId,
      promoted,
    );

    return promoted;
  }

  clear(): void {
    this.memories.clear();
  }
}
