import type {
  ID,
  MemoryReference,
  MemoryType,
} from "./types";

import {
  MemorySourceFreshnessAuthority,
  type MemorySourceFreshnessReport,
} from "./memory-source-freshness";

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

  constructor(
    private readonly freshnessAuthority?:
      MemorySourceFreshnessAuthority,
  ) {}

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

    const candidate =
      this.freshnessAuthority
        ? this.freshnessAuthority.attest(
            memory,
            memory.updatedAt,
          )
        : memory;

    this.memories.set(
      memory.id,
      {
        ...candidate,
        sourceReferences: [
          ...candidate.sourceReferences,
        ],
      },
    );
  }

  get(
    memoryId: ID,
  ): MemoryReference | undefined {
    const memory =
      this.memories.get(
        memoryId,
      );

    return memory
      ? {
          ...memory,
          sourceReferences: [
            ...memory.sourceReferences,
          ],
        }
      : undefined;
  }

  evaluateFreshness(
    memoryId: ID,
  ): MemorySourceFreshnessReport | undefined {
    if (!this.freshnessAuthority) {
      return undefined;
    }

    const memory =
      this.memories.get(memoryId);

    return memory
      ? this.freshnessAuthority.evaluate(
          memory,
        )
      : undefined;
  }

  list(): MemoryReference[] {
    return [
      ...this.memories.values(),
    ]
      .sort(
        (a, b) =>
          a.id.localeCompare(
            b.id,
          ),
      )
      .map(
        (memory) => ({
          ...memory,
          sourceReferences: [
            ...memory.sourceReferences,
          ],
        }),
      );
  }

  query(
    query: MemoryStoreQuery = {},
  ): MemoryReference[] {
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
        "K.I.N.G.S. Memory Store: limit must be a non-negative integer",
      );
    }

    const limit =
      query.limit === undefined
        ? Number.MAX_SAFE_INTEGER
        : query.limit;

    return this.list()
      .filter((memory) => {
        if (
          this.freshnessAuthority &&
          memory.authoritative &&
          !this.freshnessAuthority.isReusable(
            memory,
          )
        ) {
          return false;
        }

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
      .slice(0, limit)
      .map(
        (memory) => ({
          ...memory,
          sourceReferences: [
            ...memory.sourceReferences,
          ],
        }),
      );
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

    if (this.freshnessAuthority) {
      const freshness =
        this.freshnessAuthority.evaluate(
          memory,
        );

      if (
        freshness.status === "stale" ||
        freshness.status === "missing"
      ) {
        throw new Error(
          `K.I.N.G.S. Memory Store: memory "${memoryId}" cannot become authoritative because its source provenance is ${freshness.status}`,
        );
      }
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