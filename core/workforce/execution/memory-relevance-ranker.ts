import {
  MemoryRelevance,
} from "../memory-relevance";

import type {
  MemoryReference,
  Task,
} from "../types";

export interface MemoryRelevanceScore {
  memoryId: string;
  score: number;
  reasons: string[];
}

export interface RankedMemory {
  memory: MemoryReference;
  score: number;
  reasons: string[];
}

export class MemoryRelevanceRanker {
  private readonly relevance =
    new MemoryRelevance();

  rank(
    task: Task,
    memories: MemoryReference[],
    limit: number,
  ): RankedMemory[] {
    return this.relevance.rank(
      task,
      memories,
      limit,
    );
  }
}
