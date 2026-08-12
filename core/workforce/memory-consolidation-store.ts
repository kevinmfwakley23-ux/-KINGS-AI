import type {
  ID,
} from "./types";

import type {
  MemoryConsolidationCandidate,
} from "./memory-consolidation";

export class MemoryConsolidationStore {
  private readonly candidates =
    new Map<ID, MemoryConsolidationCandidate>();

  register(
    candidate: MemoryConsolidationCandidate,
  ): void {
    this.validateCandidate(candidate);

    if (
      this.candidates.has(candidate.id)
    ) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: duplicate candidate id "${candidate.id}"`,
      );
    }

    this.candidates.set(
      candidate.id,
      this.cloneCandidate(candidate),
    );
  }

  get(
    candidateId: ID,
  ):
    | MemoryConsolidationCandidate
    | undefined {
    const candidate =
      this.candidates.get(candidateId);

    return candidate
      ? this.cloneCandidate(candidate)
      : undefined;
  }

  list(
    limit?: number,
  ): MemoryConsolidationCandidate[] {
    if (
      limit !== undefined &&
      (
        !Number.isInteger(limit) ||
        limit < 0
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Consolidation Store: limit must be a non-negative integer",
      );
    }

    const candidates = [
      ...this.candidates.values(),
    ]
      .sort(
        (a, b) =>
          a.id.localeCompare(b.id),
      )
      .map(
        (candidate) =>
          this.cloneCandidate(candidate),
      );

    if (limit === undefined) {
      return candidates;
    }

    return candidates.slice(
      0,
      limit,
    );
  }

  clear(): void {
    this.candidates.clear();
  }

  private validateCandidate(
    candidate: MemoryConsolidationCandidate,
  ): void {
    if (!candidate.id.trim()) {
      throw new Error(
        "K.I.N.G.S. Consolidation Store: candidate id is required",
      );
    }

    if (!candidate.summary.trim()) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: candidate "${candidate.id}" requires a summary`,
      );
    }

    if (!candidate.consolidationReason.trim()) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: candidate "${candidate.id}" requires a consolidation reason`,
      );
    }

    if (candidate.authoritative) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: candidate "${candidate.id}" cannot be authoritative`,
      );
    }

    if (
      candidate.sourceMemoryIds.length === 0
    ) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: candidate "${candidate.id}" requires source memories`,
      );
    }

    if (
      new Set(
        candidate.sourceMemoryIds,
      ).size !==
      candidate.sourceMemoryIds.length
    ) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: candidate "${candidate.id}" contains duplicate source memories`,
      );
    }

    if (
      candidate.sourceReferences.length === 0
    ) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: candidate "${candidate.id}" requires source provenance`,
      );
    }

    if (
      candidate.estimatedInputCharacters < 0 ||
      candidate.estimatedOutputCharacters < 0 ||
      candidate.estimatedCharacterSavings < 0
    ) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: candidate "${candidate.id}" contains invalid size accounting`,
      );
    }
  }

  private cloneCandidate(
    candidate: MemoryConsolidationCandidate,
  ): MemoryConsolidationCandidate {
    return {
      ...candidate,
      sourceMemoryIds: [
        ...candidate.sourceMemoryIds,
      ],
      sourceReferences: [
        ...candidate.sourceReferences,
      ],
    };
  }
}
