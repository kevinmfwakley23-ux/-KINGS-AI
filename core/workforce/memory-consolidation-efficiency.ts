import type {
  MemoryReference,
} from "./types";

export type ConsolidationDecision =
  | "retain"
  | "consolidate";

export interface ConsolidationEfficiencyDecision {
  decision:
    ConsolidationDecision;

  reason:
    string;

  sourceMemoryIds:
    string[];

  sourceReferences:
    string[];

  estimatedReduction:
    number;
}

export interface ConsolidationBatch {
  memories:
    MemoryReference[];

  maxSources:
    number;
}

function normalize(
  value:
    string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " ",
    );
}

function unique(
  values:
    string[],
):
  string[] {
  return [
    ...new Set(
      values,
    ),
  ];
}

export class MemoryConsolidationEfficiencyAuthority {
  decide(
    memories:
      MemoryReference[],
  ):
    ConsolidationEfficiencyDecision {
    if (
      memories.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Consolidation: at least one memory is required",
      );
    }

    for (
      const memory of memories
    ) {
      if (
        !memory.id
      ) {
        throw new Error(
          "K.I.N.G.S. Memory Consolidation: memory id is required",
        );
      }

      if (
        !memory.summary.trim()
      ) {
        throw new Error(
          `K.I.N.G.S. Memory Consolidation: memory "${memory.id}" requires a summary`,
        );
      }

      if (
        memory.sourceReferences.length ===
        0
      ) {
        throw new Error(
          `K.I.N.G.S. Memory Consolidation: memory "${memory.id}" requires provenance`,
        );
      }
    }

    if (
      memories.length ===
      1
    ) {
      const memory =
        memories[0];

      return {
        decision:
          "retain",
        reason:
          "Single memory does not justify consolidation.",
        sourceMemoryIds: [
          memory.id,
        ],
        sourceReferences: unique(
          memory.sourceReferences,
        ),
        estimatedReduction:
          0,
      };
    }

    const normalizedSummaries =
      memories.map(
        (
          memory,
        ) =>
          normalize(
            memory.summary,
          ),
      );

    const distinctSummaries =
      unique(
        normalizedSummaries,
      );

    if (
      distinctSummaries.length ===
      memories.length
    ) {
      return {
        decision:
          "consolidate",
        reason:
          "Multiple distinct memories may benefit from consolidation.",
        sourceMemoryIds:
          memories.map(
            (
              memory,
            ) =>
              memory.id,
          ),
        sourceReferences:
          unique(
            memories.flatMap(
              (
                memory,
              ) =>
                memory.sourceReferences,
            ),
          ),
        estimatedReduction:
          Math.max(
            memories.length - 1,
            0,
          ),
      };
    }

    return {
      decision:
        "consolidate",
      reason:
        "Repeated or overlapping memory content is eligible for consolidation.",
      sourceMemoryIds:
        memories.map(
          (
            memory,
          ) =>
            memory.id,
        ),
      sourceReferences:
        unique(
          memories.flatMap(
            (
              memory,
            ) =>
              memory.sourceReferences,
          ),
        ),
      estimatedReduction:
        Math.max(
          memories.length - distinctSummaries.length,
          0,
        ),
    };
  }

  deduplicate(
    memories:
      MemoryReference[],
  ):
    MemoryReference[] {
    const seen =
      new Set<string>();

    const result:
      MemoryReference[] = [];

    for (
      const memory of memories
    ) {
      const key =
        [
          memory.type,
          memory.missionId ?? "",
          memory.taskId ?? "",
          normalize(
            memory.summary,
          ),
        ].join(
          "|",
        );

      if (
        seen.has(
          key,
        )
      ) {
        continue;
      }

      seen.add(
        key,
      );

      result.push(
        memory,
      );
    }

    return result;
  }

  batch(
    memories:
      MemoryReference[],
    maxSources:
      number,
  ):
    ConsolidationBatch[] {
    if (
      maxSources <
      2
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Consolidation: maxSources must be at least 2",
      );
    }

    const batches:
      ConsolidationBatch[] = [];

    for (
      let index = 0;
      index <
      memories.length;
      index +=
        maxSources
    ) {
      batches.push({
        memories:
          memories.slice(
            index,
            index +
              maxSources,
          ),
        maxSources,
      });
    }

    return batches;
  }
}
