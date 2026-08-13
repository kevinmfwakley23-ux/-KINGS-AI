import type {
  MemoryReference,
} from "./types";

export interface MemoryHealthMetrics {
  memoryId: string;

  importance:
    number;

  relevance:
    number;

  recency:
    number;

  provenance:
    number;

  authority:
    number;

  reuse:
    number;

  supersession:
    number;

  estimatedContextCost:
    number;

  health:
    "healthy" |
    "watch" |
    "degraded";

  reasons:
    string[];
}

export interface MemoryHealthOptions {
  now:
    string;

  referenceMissionId?:
    string;

  referenceTaskId?:
    string;

  retrievalCount?:
    number;

  usefulRetrievalCount?:
    number;

  superseded?:
    boolean;

  estimatedTokenCost?:
    number;
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
): number {
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

export class MemoryHealthMetricsAuthority {
  assess(
    memory:
      MemoryReference,
    options:
      MemoryHealthOptions,
  ):
    MemoryHealthMetrics {
    if (
      !memory.id
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Health: memory id is required",
      );
    }

    if (
      !memory.summary.trim()
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Health: memory "${memory.id}" requires a summary`,
      );
    }

    if (
      !memory.createdAt
    ) {
      throw new Error(
        `K.I.N.G.S. Memory Health: memory "${memory.id}" requires createdAt`,
      );
    }

    if (
      !options.now
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Health: now is required",
      );
    }

    const retrievalCount =
      Math.max(
        0,
        options.retrievalCount ??
          0,
      );

    const usefulRetrievalCount =
      Math.max(
        0,
        Math.min(
          retrievalCount,
          options.usefulRetrievalCount ??
            0,
        ),
      );

    const relevance =
      this.relevanceScore(
        memory,
        options,
      );

    const recency =
      this.recencyScore(
        memory,
        options.now,
      );

    const provenance =
      memory.sourceReferences.length >
      0
        ? 1
        : 0;

    const authority =
      memory.authoritative
        ? 1
        : 0;

    const reuse =
      retrievalCount ===
      0
        ? 0
        : clamp(
            usefulRetrievalCount /
              retrievalCount,
          );

    const supersession =
      options.superseded
        ? 0
        : 1;

    const estimatedContextCost =
      Math.max(
        0,
        options.estimatedTokenCost ??
          this.estimateContextCost(
            memory.summary,
          ),
      );

    const importance =
      clamp(
        (
          relevance *
            0.25 +
          recency *
            0.10 +
          provenance *
            0.15 +
          authority *
            0.20 +
          reuse *
            0.15 +
          supersession *
            0.15
        ),
      );

    const reasons:
      string[] = [];

    if (
      relevance >=
      0.75
    ) {
      reasons.push(
        "high relevance",
      );
    }

    if (
      recency >=
      0.75
    ) {
      reasons.push(
        "recent memory",
      );
    }

    if (
      provenance <
      1
    ) {
      reasons.push(
        "missing provenance",
      );
    }

    if (
      authority ===
      1
    ) {
      reasons.push(
        "authoritative memory",
      );
    }

    if (
      reuse >=
      0.75
    ) {
      reasons.push(
        "frequently useful",
      );
    }

    if (
      supersession ===
      0
    ) {
      reasons.push(
        "superseded memory",
      );
    }

    if (
      estimatedContextCost >=
      1000
    ) {
      reasons.push(
        "high context cost",
      );
    }

    let health:
      MemoryHealthMetrics["health"] =
      "healthy";

    if (
      provenance ===
      0 ||
      (
        supersession ===
        0 &&
        authority ===
        1
      )
    ) {
      health =
        "degraded";
    } else if (
      importance <
      0.45 ||
      (
        estimatedContextCost >=
        1000 &&
        relevance <
        0.50
      )
    ) {
      health =
        "watch";
    }

    return {
      memoryId:
        memory.id,

      importance:

        Number(
          importance.toFixed(
            4,
          ),
        ),

      relevance:
        Number(
          relevance.toFixed(
            4,
          ),
        ),

      recency:
        Number(
          recency.toFixed(
            4,
          ),
        ),

      provenance:

        Number(
          provenance.toFixed(
            4,
          ),
        ),

      authority:
        Number(
          authority.toFixed(
            4,
          ),
        ),

      reuse:
        Number(
          reuse.toFixed(
            4,
          ),
        ),

      supersession:
        Number(
          supersession.toFixed(
            4,
          ),
        ),

      estimatedContextCost,

      health,

      reasons,
    };
  }

  compare(
    left:
      MemoryHealthMetrics,
    right:
      MemoryHealthMetrics,
  ):
    number {
    return (
      right.importance -
      left.importance
    );
  }

  private relevanceScore(
    memory:
      MemoryReference,
    options:
      MemoryHealthOptions,
  ):
    number {
    let score =
      0.40;

    if (
      options.referenceMissionId &&
      memory.missionId ===
        options.referenceMissionId
    ) {
      score +=
        0.30;
    }

    if (
      options.referenceTaskId &&
      memory.taskId ===
        options.referenceTaskId
    ) {
      score +=
        0.20;
    }

    if (
      memory.authoritative
    ) {
      score +=
        0.10;
    }

    return clamp(
      score,
    );
  }

  private recencyScore(
    memory:
      MemoryReference,
    now:
      string,
  ):
    number {
    const days =
      daysBetween(
        memory.updatedAt ||
          memory.createdAt,
        now,
      );

    return clamp(
      1 /
        (
          1 +
          days /
            30
        ),
    );
  }

  private estimateContextCost(
    summary:
      string,
  ):
    number {
    return Math.max(
      1,
      Math.ceil(
        summary.length /
          4,
      ),
    );
  }
}
