import type {
  MemoryReference,
  MemoryResult,
} from "./types";

import {
  MemoryContextBudgetAuthority,
} from "./memory-context-budget";

function assert(
  condition:
    boolean,
  message:
    string,
):
  void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function memory(
  id:
    string,
  summary:
    string,
):
  MemoryReference {
  return {
    id,
    type:
      "semantic",
    summary,
    sourceReferences:
      [
        `source-${id}`,
      ],
    missionId:
      "mission-memory-health-008",
    taskId:
      "task-memory-health-008",
    authoritative:
      false,
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T00:00:00.000Z",
  };
}

const authority =
  new MemoryContextBudgetAuthority();

const smallA =
  memory(
    "memory-small-a",
    "Short verified rule.",
  );

const smallB =
  memory(
    "memory-small-b",
    "Another short rule.",
  );

const large =
  memory(
    "memory-large",
    "This is a deliberately long memory payload used to prove that the context budget rejects an item that does not fit inside the remaining token allowance.",
  );

const knowledge:
  MemoryResult = {
  query:
    "context budget proof",
  records: [
    {
      id:
        "knowledge-small",
      sourceId:
        "source-knowledge-small",
      memoryType:
        "semantic",
      summary:
        "Small reusable rule.",
      content:
        "Keep active context bounded.",
      evidenceIds:
        [],
      authoritative:
        true,
      createdAt:
        "2026-08-13T00:00:00.000Z",
      updatedAt:
        "2026-08-13T00:00:00.000Z",
    },
  ],
  evidence: [],
  sourceIds: [
    "source-knowledge-small",
  ],
  createdAt:
    "2026-08-13T00:00:00.000Z",
};

const result =
  authority.calculate({
    memories: [
      smallA,
      smallB,
      large,
    ],
    knowledge,
    budgetTokens:
      10,
  });

assert(
  result.budgetTokens ===
    10,
  "Budget amount must be preserved.",
);

assert(
  result.estimatedUsedTokens <=
    result.budgetTokens,
  "Estimated context usage must never exceed the configured budget.",
);

console.log(
  "008.MEMORY context budget ceiling: SUCCESS",
);

assert(
  result.estimatedRemainingTokens >=
    0,
  "Remaining context budget must never be negative.",
);

console.log(
  "008.MEMORY non-negative remaining budget: SUCCESS",
);

assert(
  result.selectedMemoryIds.length +
    result.selectedKnowledgeIds.length >
    0,
  "A fitting context item should be admitted when budget allows.",
);

console.log(
  "008.MEMORY budget-aware context admission: SUCCESS",
);

assert(
  result.rejectedMemoryIds.includes(
    "memory-large",
  ) ||
  result.rejectedKnowledgeIds.includes(
    "knowledge-small",
  ),
  "At least one oversized candidate must be rejected when the budget is exhausted.",
);

console.log(
  "008.MEMORY over-budget candidate rejection: SUCCESS",
);

assert(
  result.utilization >=
    0 &&
  result.utilization <=
    1,
  "Context utilization must remain between zero and one.",
);

console.log(
  "008.MEMORY utilization accounting: SUCCESS",
);

const exact =
  authority.calculate({
    memories: [
      memory(
        "memory-exact",
        "12345678",
      ),
    ],
    budgetTokens:
      2,
  });

assert(
  exact.estimatedUsedTokens <=
    2,
  "Exact-fit accounting must never exceed the budget.",
);

console.log(
  "008.MEMORY exact-budget boundary: SUCCESS",
);

const empty =
  authority.calculate({
    memories: [],
    budgetTokens:
      5,
  });

assert(
  empty.estimatedUsedTokens ===
    0,
  "Empty context must consume zero estimated tokens.",
);

assert(
  empty.utilization ===
    0,
  "Empty context must report zero utilization.",
);

console.log(
  "008.MEMORY empty-context accounting: SUCCESS",
);

let invalidBudgetRejected =
  false;

try {
  authority.calculate({
    memories: [],
    budgetTokens:
      0,
  });
} catch (error) {
  invalidBudgetRejected =
    error instanceof Error &&
    error.message.includes(
      "budgetTokens must be a positive integer",
    );
}

assert(
  invalidBudgetRejected,
  "Invalid context budgets must be rejected.",
);

console.log(
  "008.MEMORY invalid-budget protection: SUCCESS",
);

const deterministicA =
  authority.calculate({
    memories: [
      smallA,
      smallB,
    ],
    knowledge,
    budgetTokens:
      20,
  });

const deterministicB =
  authority.calculate({
    memories: [
      smallA,
      smallB,
    ],
    knowledge,
    budgetTokens:
      20,
  });

assert(
  JSON.stringify(
    deterministicA,
  ) ===
    JSON.stringify(
      deterministicB,
    ),
  "Context budget accounting must be deterministic.",
);

console.log(
  "008.MEMORY deterministic budget accounting: SUCCESS",
);

console.log(
  "MEMORY-HEALTH-008 CONTEXT-BUDGET ACCOUNTING AUTHORITY: SUCCESS",
);
