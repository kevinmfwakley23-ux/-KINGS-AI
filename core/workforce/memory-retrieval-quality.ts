import type {
  MemoryReference,
  Task,
} from "./types";

import {
  MemoryRelevance,
  type RankedMemory,
} from "./memory-relevance";

export interface MemoryRetrievalQuality {
  memoryId:
    string;

  relevanceScore:
    number;

  contextualMatch:
    number;

  authorityScore:
    number;

  freshnessScore:
    number;

  provenanceScore:
    number;

  supersessionRisk:
    number;

  quality:
    number;

  eligible:
    boolean;

  reasons:
    string[];
}

export interface MemoryRetrievalQualityResult {
  taskId:
    string;

  candidates:
    MemoryRetrievalQuality[];

  selectedMemoryIds:
    string[];

  rejectedMemoryIds:
    string[];
}

export interface MemoryRetrievalQualityOptions {
  now:
    string;

  limit:
    number;

  minimumQuality:
    number;

  supersededMemoryIds?:
    string[];
}

function clamp(
  value:
    number,
): number {
  return Math.max(
    0,
    Math.min(
      1,
      value,
    ),
  );
}

function daysBetween(
  older:
    string,
  newer:
    string,
):
  number {
  const olderMs =
    Date.parse(
      older,
    );

  const newerMs =
    Date.parse(
      newer,
    );

  if (
    !Number.isFinite(
      olderMs,
    ) ||
    !Number.isFinite(
      newerMs,
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    (
      newerMs -
      olderMs
    ) /
      86_400_000,
  );
}

export class MemoryRetrievalQualityAuthority {
  constructor(
    private readonly relevance =
      new MemoryRelevance(),
  ) {}

  evaluate(
    task:
      Task,
    memories:
      MemoryReference[],
    options:
      MemoryRetrievalQualityOptions,
  ):
    MemoryRetrievalQualityResult {
    if (
      !Number.isInteger(
        options.limit,
      ) ||
      options.limit <
        0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Retrieval Quality: limit must be a non-negative integer",
      );
    }

    if (
      options.minimumQuality <
        0 ||
      options.minimumQuality >
        1
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Retrieval Quality: minimumQuality must be between 0 and 1",
      );
    }

    if (
      !options.now
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Retrieval Quality: now is required",
      );
    }

    const ranked =
      this.relevance.rank(
        task,
        memories,
        memories.length,
      );

    const qualities =
      ranked.map(
        (
          entry,
        ) =>
          this.assess(
            task,
            entry,
            options,
          ),
      );

    qualities.sort(
      (
        a,
        b,
      ) => {
        if (
          b.quality !==
          a.quality
        ) {
          return (
            b.quality -
            a.quality
          );
        }

        return a.memoryId.localeCompare(
          b.memoryId,
        );
      },
    );

    const eligible =
      qualities.filter(
        (
          candidate,
        ) =>
          candidate.eligible,
      );

    const selected =
      eligible.slice(
        0,
        options.limit,
      );

    const selectedIds =
      new Set(
        selected.map(
          (
            candidate,
          ) =>
            candidate.memoryId,
        ),
      );

    return {
      taskId:
        task.id,

      candidates:
        qualities,

      selectedMemoryIds:
        selected.map(
          (
            candidate,
          ) =>
            candidate.memoryId,
        ),

      rejectedMemoryIds:
        qualities
          .filter(
            (
              candidate,
            ) =>
              !candidate.eligible ||
              !selectedIds.has(
                candidate.memoryId,
              ),
          )
          .map(
            (
              candidate,
            ) =>
              candidate.memoryId,
          ),
    };
  }

  private assess(
    task:
      Task,
    ranked:
      RankedMemory,
    options:
      MemoryRetrievalQualityOptions,
  ):
    MemoryRetrievalQuality {
    const memory =
      ranked.memory;

    const contextualMatch =
      clamp(
        (
          (
            memory.missionId ===
            task.missionId
              ? 0.50
              : 0
          ) +
          (
            memory.taskId ===
            task.id
              ? 0.30
              : 0
          ) +
          (
            memory.missionId &&
            memory.taskId
              ? 0.20
              : 0
          )
        ),
      );

    const authorityScore =
      memory.authoritative
        ? 1
        : 0.50;

    const provenanceScore =
      memory.sourceReferences.length >
      0
        ? 1
        : 0;

    const freshnessScore =
      clamp(
        1 /
          (
            1 +
            daysBetween(
              memory.updatedAt ||
                memory.createdAt,
              options.now,
            ) /
              30
          ),
      );

    const superseded =
      new Set(
        options.supersededMemoryIds ??
          [],
      ).has(
        memory.id,
      );

    const supersessionRisk =
      superseded
        ? 1
        : 0;

    const relevanceScore =
      clamp(
        ranked.score /
          300,
      );

    const creatorApprovedCurrentTruth =
      memory.authoritative &&
      !superseded;

    const quality =
      creatorApprovedCurrentTruth
        ? 1
        : clamp(
            relevanceScore *
              0.30 +
            contextualMatch *
              0.25 +
            authorityScore *
              0.15 +
            freshnessScore *
              0.10 +
            provenanceScore *
              0.10 +
            (
              1 -
              supersessionRisk
            ) *
              0.10,
          );

    const reasons:
      string[] =
      [
        ...ranked.reasons,
      ];

    if (
      contextualMatch >=
      0.70
    ) {
      reasons.push(
        "strong contextual match",
      );
    }

    if (
      provenanceScore <
      1
    ) {
      reasons.push(
        "missing provenance",
      );
    }

    if (
      superseded
    ) {
      reasons.push(
        "superseded memory",
      );
    }

    if (
      freshnessScore <
      0.25
    ) {
      reasons.push(
        "stale memory",
      );
    }

    if (
      creatorApprovedCurrentTruth
    ) {
      reasons.push(
        "creator-approved current truth",
      );
    } else if (
      quality >=
      options.minimumQuality
    ) {
      reasons.push(
        "retrieval eligible",
      );
    } else {
      reasons.push(
        "below retrieval threshold",
      );
    }

    return {
      memoryId:
        memory.id,

      relevanceScore:
        Number(
          relevanceScore.toFixed(
            4,
          ),
        ),

      contextualMatch:
        Number(
          contextualMatch.toFixed(
            4,
          ),
        ),

      authorityScore:
        Number(
          authorityScore.toFixed(
            4,
          ),
        ),

      freshnessScore:
        Number(
          freshnessScore.toFixed(
            4,
          ),
        ),

      provenanceScore:
        Number(
          provenanceScore.toFixed(
            4,
          ),
        ),

      supersessionRisk,

      quality:
        Number(
          quality.toFixed(
            4,
          ),
        ),

      eligible:
        provenanceScore ===
          1 &&
        !superseded &&
        (
          creatorApprovedCurrentTruth ||
          quality >=
            options.minimumQuality
        ),

      reasons,
    };
  }
}
