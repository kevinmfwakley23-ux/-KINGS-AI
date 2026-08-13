import type {
  MemoryReference,
  MemoryResult,
} from "./types";

export interface MemoryContextBudgetInput {
  memories:
    MemoryReference[];

  knowledge?:
    MemoryResult;

  budgetTokens:
    number;
}

export interface MemoryContextBudgetItem {
  id:
    string;

  kind:
    "memory" |
    "knowledge";

  estimatedTokens:
    number;

  included:
    boolean;

  reason:
    string;
}

export interface MemoryContextBudgetResult {
  budgetTokens:
    number;

  estimatedUsedTokens:
    number;

  estimatedRemainingTokens:
    number;

  utilization:
    number;

  selectedMemoryIds:
    string[];

  selectedKnowledgeIds:
    string[];

  rejectedMemoryIds:
    string[];

  rejectedKnowledgeIds:
    string[];

  items:
    MemoryContextBudgetItem[];
}

function estimateTokens(
  value:
    string,
): number {
  return Math.max(
    1,
    Math.ceil(
      value.length /
        4,
    ),
  );
}

export class MemoryContextBudgetAuthority {
  calculate(
    input:
      MemoryContextBudgetInput,
  ):
    MemoryContextBudgetResult {
    if (
      !Number.isInteger(
        input.budgetTokens,
      ) ||
      input.budgetTokens <=
        0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Context Budget: budgetTokens must be a positive integer",
      );
    }

    const items:
      MemoryContextBudgetItem[] = [];

    for (
      const memory of
        input.memories
    ) {
      items.push({
        id:
          memory.id,

        kind:
          "memory",

        estimatedTokens:
          estimateTokens(
            memory.summary,
          ),

        included:
          false,

        reason:
          "",
      });
    }

    for (
      const record of
        input.knowledge
          ?.records ??
        []
    ) {
      items.push({
        id:
          record.id,

        kind:
          "knowledge",

        estimatedTokens:
          estimateTokens(
            [
              record.summary,
              record.content,
            ].join(
              " ",
            ),
          ),

        included:
          false,

        reason:
          "",
      });
    }

    /*
     * Preserve caller ordering.
     * Retrieval quality/ranking is responsible for ordering
     * before budget accounting reaches this boundary.
     */
    let remaining =
      input.budgetTokens;

    for (
      const item of
        items
    ) {
      if (
        item.estimatedTokens <=
        remaining
      ) {
        item.included =
          true;

        item.reason =
          "fits within remaining context budget";

        remaining -=
          item.estimatedTokens;

        continue;
      }

      item.included =
        false;

      item.reason =
        "excluded because it exceeds remaining context budget";
    }

    const estimatedUsedTokens =
      input.budgetTokens -
      remaining;

    const selectedMemoryIds =
      items
        .filter(
          (
            item,
          ) =>
            item.included &&
            item.kind ===
              "memory",
        )
        .map(
          (
            item,
          ) =>
            item.id,
        );

    const selectedKnowledgeIds =
      items
        .filter(
          (
            item,
          ) =>
            item.included &&
            item.kind ===
              "knowledge",
        )
        .map(
          (
            item,
          ) =>
            item.id,
        );

    const rejectedMemoryIds =
      items
        .filter(
          (
            item,
          ) =>
            !item.included &&
            item.kind ===
              "memory",
        )
        .map(
          (
            item,
          ) =>
            item.id,
        );

    const rejectedKnowledgeIds =
      items
        .filter(
          (
            item,
          ) =>
            !item.included &&
            item.kind ===
              "knowledge",
        )
        .map(
          (
            item,
          ) =>
            item.id,
        );

    return {
      budgetTokens:
        input.budgetTokens,

      estimatedUsedTokens,

      estimatedRemainingTokens:
        remaining,

      utilization:
        Number(
          (
            estimatedUsedTokens /
            input.budgetTokens
          ).toFixed(
            4,
          ),
        ),

      selectedMemoryIds,

      selectedKnowledgeIds,

      rejectedMemoryIds,

      rejectedKnowledgeIds,

      items:
        items.map(
          (
            item,
          ) => ({
            ...item,
          }),
        ),
    };
  }
}
