import type {
  MemoryQuery,
  MemoryResult,
} from "./types";

export interface KnowledgeRuntimeAdapter {
  retrieve(
    query: MemoryQuery,
  ): Promise<MemoryResult>;
}
