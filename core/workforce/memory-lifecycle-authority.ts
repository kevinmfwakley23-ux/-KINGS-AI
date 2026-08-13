import type {
  MemoryReference,
  MemoryType,
} from "./types";

export type MemoryLifecycleClass =
  | "working"
  | "durable"
  | "archival";

export type MemoryRetentionPolicy =
  | "active"
  | "durable"
  | "archive";

export type MemoryRetrievalPolicy =
  | "active-first"
  | "durable-search"
  | "historical-only";

export type MemoryPromotionPolicy =
  | "eligible"
  | "verification-required"
  | "never";

export interface MemoryLifecycleClassification {
  memoryId: string;
  memoryType: MemoryType;
  lifecycle: MemoryLifecycleClass;
  retention: MemoryRetentionPolicy;
  retrieval: MemoryRetrievalPolicy;
  promotion: MemoryPromotionPolicy;
  authoritative: boolean;
}

export interface MemoryLifecyclePolicy {
  lifecycle:
    MemoryLifecycleClass;
  retention:
    MemoryRetentionPolicy;
  retrieval:
    MemoryRetrievalPolicy;
  promotion:
    MemoryPromotionPolicy;
}

export class MemoryLifecycleAuthority {
  classify(
    memory: MemoryReference,
  ): MemoryLifecycleClassification {
    if (!memory.id) {
      throw new Error(
        "K.I.N.G.S. Memory Lifecycle: memory id is required",
      );
    }

    if (!memory.summary.trim()) {
      throw new Error(
        `K.I.N.G.S. Memory Lifecycle: memory "${memory.id}" requires a summary`,
      );
    }

    const policy =
      this.policyFor(memory.type);

    if (
      memory.authoritative &&
      policy.lifecycle === "working"
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Lifecycle: authoritative memory "${memory.id}" cannot be working-only`,
      );
    }

    if (
      memory.authoritative &&
      policy.promotion === "never"
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Lifecycle: authoritative memory "${memory.id}" cannot use a never-promote policy`,
      );
    }

    return {
      memoryId:
        memory.id,
      memoryType:
        memory.type,
      lifecycle:
        policy.lifecycle,
      retention:
        policy.retention,
      retrieval:
        policy.retrieval,
      promotion:
        policy.promotion,
      authoritative:
        memory.authoritative,
    };
  }

  policyFor(
    memoryType: MemoryType,
  ): MemoryLifecyclePolicy {
    switch (memoryType) {
      case "working":
        return {
          lifecycle:
            "working",
          retention:
            "active",
          retrieval:
            "active-first",
          promotion:
            "never",
        };

      case "episodic":
        return {
          lifecycle:
            "durable",
          retention:
            "durable",
          retrieval:
            "active-first",
          promotion:
            "verification-required",
        };

      case "semantic":
        return {
          lifecycle:
            "durable",
          retention:
            "durable",
          retrieval:
            "durable-search",
          promotion:
            "verification-required",
        };

      case "procedural":
        return {
          lifecycle:
            "durable",
          retention:
            "durable",
          retrieval:
            "durable-search",
          promotion:
            "verification-required",
        };

      default:
        throw new Error(
          `K.I.N.G.S. Memory Lifecycle: unsupported memory type "${String(memoryType)}"`,
        );
    }
  }
}
