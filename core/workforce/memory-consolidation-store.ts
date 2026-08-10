import type {
  ID,
} from "./types";

import type {
  MemoryConsolidationCandidate,
} from "./memory-consolidation";

export class MemoryConsolidationStore {
  private readonly candidates =
    new Map<
      ID,
      MemoryConsolidationCandidate
    >();

  register(
    candidate: MemoryConsolidationCandidate,
  ): void {
    if (!candidate.id) {
      throw new Error(
        "K.I.N.G.S. Consolidation Store: candidate id is required",
      );
    }

    if (
      candidate.authoritative
    ) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: candidate "${candidate.id}" cannot be authoritative`,
      );
    }

    if (
      candidate.sourceMemoryIds.length ===
      0
    ) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: candidate "${candidate.id}" requires source memories`,
      );
    }

    if (
      this.candidates.has(
        candidate.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Consolidation Store: duplicate candidate id "${candidate.id}"`,
      );
    }

    this.candidates.set(
      candidate.id,
      {
        ...candidate,
        sourceMemoryIds: [
          ...candidate.sourceMemoryIds,
        ],
        sourceReferences: [
          ...candidate.sourceReferences,
        ],
      },
    );
  }

  get(
    candidateId: ID,
  ):
    | MemoryConsolidationCandidate
    | undefined {
    const candidate =
      this.candidates.get(
        candidateId,
      );

    return candidate
      ? {
          ...candidate,
          sourceMemoryIds: [
            ...candidate.sourceMemoryIds,
          ],
          sourceReferences: [
            ...candidate.sourceReferences,
          ],
        }
      : undefined;
  }

  list():
    MemoryConsolidationCandidate[] {
    return [
      ...this.candidates.values(),
    ].map(
      (candidate) => ({
        ...candidate,
        sourceMemoryIds: [
          ...candidate.sourceMemoryIds,
        ],
        sourceReferences: [
          ...candidate.sourceReferences,
        ],
      }),
    );
  }
}
