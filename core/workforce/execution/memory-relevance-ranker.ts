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
  rank(
    task: Task,
    memories: MemoryReference[],
    limit: number,
  ): RankedMemory[] {
    if (limit < 1) {
      throw new Error(
        "K.I.N.G.S. Memory Relevance Ranker: limit must be at least 1",
      );
    }

    const ranked =
      memories.map(
        (memory) =>
          this.score(
            task,
            memory,
          ),
      );

    ranked.sort(
      (a, b) => {
        if (
          b.score !== a.score
        ) {
          return b.score - a.score;
        }

        if (
          a.memory.authoritative !==
          b.memory.authoritative
        ) {
          return a.memory.authoritative
            ? -1
            : 1;
        }

        return (
          a.memory.id.localeCompare(
            b.memory.id,
          )
        );
      },
    );

    return ranked.slice(
      0,
      limit,
    );
  }

  private score(
    task: Task,
    memory: MemoryReference,
  ): RankedMemory {
    let score = 0;
    const reasons: string[] = [];

    if (
      memory.missionId ===
      task.missionId
    ) {
      score += 100;
      reasons.push(
        "mission match",
      );
    }

    if (
      memory.taskId ===
      task.id
    ) {
      score += 200;
      reasons.push(
        "exact task match",
      );
    }

    if (
      memory.authoritative
    ) {
      score += 50;
      reasons.push(
        "authoritative memory",
      );
    }

    const taskText =
      this.tokens(
        [
          task.name,
          task.description,
          ...task.expectedOutputs,
          ...task.inputReferences,
        ].join(" "),
      );

    const memoryText =
      this.tokens(
        [
          memory.summary,
          ...memory.sourceReferences,
        ].join(" "),
      );

    const overlap =
      [...taskText].filter(
        (token) =>
          memoryText.has(token),
      );

    if (
      overlap.length > 0
    ) {
      const relevance =
        Math.min(
          overlap.length * 10,
          50,
        );

      score += relevance;

      reasons.push(
        `lexical relevance: ${overlap.length} matching term(s)`,
      );
    }

    switch (
      memory.type
    ) {
      case "procedural":
        score += 15;
        reasons.push(
          "procedural memory",
        );
        break;

      case "semantic":
        score += 12;
        reasons.push(
          "semantic memory",
        );
        break;

      case "episodic":
        score += 8;
        reasons.push(
          "episodic memory",
        );
        break;

      case "working":
        score += 5;
        reasons.push(
          "working memory",
        );
        break;
    }

    return {
      memory,
      score,
      reasons,
    };
  }

  private tokens(
    value: string,
  ): Set<string> {
    return new Set(
      value
        .toLowerCase()
        .replace(
          /[^a-z0-9_-]+/g,
          " ",
        )
        .split(/\s+/)
        .filter(
          (token) =>
            token.length >= 3,
        ),
    );
  }
}
