import {
  GovernedMemoryStore,
} from "./memory-health-002-enforcement";

import {
  MemoryContextBudgetAuthority,
} from "./memory-health-003-context-budget";

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

async function main():
  Promise<void> {
  const store =
    new GovernedMemoryStore();

  store.write({
    id:
      "mission-critical",

    content:
      "Critical mission state.",

    lifecycle: {
      kind:
        "mission-state",

      verified:
        false,

      superseded:
        false,

      missionId:
        "mission-005",
    },

    createdAt:
      "2026-08-13T16:00:00.000Z",
  });

  store.write({
    id:
      "project-critical",

    content:
      "Critical project state.",

    lifecycle: {
      kind:
        "project-state",

      verified:
        false,

      superseded:
        false,

      projectId:
        "kings",
    },

    createdAt:
      "2026-08-13T16:01:00.000Z",
  });

  store.write({
    id:
      "verified-knowledge",

    content:
      "Verified reusable knowledge.",

    lifecycle: {
      kind:
        "verified-knowledge",

      verified:
        true,

      superseded:
        false,
    },

    createdAt:
      "2026-08-13T16:02:00.000Z",
  });

  store.write({
    id:
      "candidate-knowledge",

    content:
      "Unverified candidate knowledge.",

    lifecycle: {
      kind:
        "fact",

      verified:
        false,

      superseded:
        false,
    },

    createdAt:
      "2026-08-13T16:03:00.000Z",
  });

  store.write({
    id:
      "archive",

    content:
      "Historical material.",

    lifecycle: {
      kind:
        "historical-record",

      verified:
        true,

      superseded:
        false,
    },

    createdAt:
      "2026-08-13T16:04:00.000Z",
  });

  const active =
    store.retrieveActive(
      100,
    );

  assert(
    active.length ===
      4,

    "Active retrieval must exclude archival memory before context budgeting.",
  );

  console.log(
    "001.MEMORY-HEALTH-003 durable memory population + active filtering: SUCCESS",
  );

  const authority =
    new MemoryContextBudgetAuthority();

  const candidates =
    active.map(
      (
        record,
      ) => ({
        record,

        relevance:
          record.id ===
            "mission-critical"
            ? 1
            : record.id ===
                "project-critical"
              ? 0.95
              : record.id ===
                  "verified-knowledge"
                ? 0.9
                : 0.3,

        priority:
          record.id ===
            "mission-critical"
            ? 1
            : record.id ===
                "project-critical"
              ? 0.9
              : record.id ===
                  "verified-knowledge"
                ? 0.8
                : 0.2,

        estimatedTokens:
          record.id ===
            "mission-critical"
            ? 120
            : record.id ===
                "project-critical"
              ? 120
              : record.id ===
                  "verified-knowledge"
                ? 120
                : 120,
      }),
    );

  const constrained =
    authority.select(
      candidates,
      {
        maxTokens:
          240,

        minimumRelevance:
          0.5,
      },
    );

  assert(
    constrained.estimatedTokens <=
      240,

    "Selected context must never exceed the configured token budget.",
  );

  assert(
    constrained.records.length ===
      2,

    "The constrained context must contain only the highest-value records that fit.",
  );

  assert(
    constrained.records[0].id ===
      "mission-critical",

    "Mission-critical memory must win the highest-value context position.",
  );

  assert(
    constrained.records[1].id ===
      "project-critical",

    "Project-critical memory must receive the next context position.",
  );

  assert(
    !constrained.records.some(
      (
        record,
      ) =>
        record.id ===
        "archive",
    ),

    "Archival memory must never reach context selection.",
  );

  console.log(
    "002.MEMORY-HEALTH-003 hard context budget enforcement: SUCCESS",
  );

  const expanded =
    authority.select(
      candidates,
      {
        maxTokens:
          360,

        minimumRelevance:
          0.5,
      },
    );

  assert(
    expanded.records.length ===
      3,

    "A larger context budget must admit additional high-value memory.",
  );

  assert(
    expanded.estimatedTokens <=
      360,

    "Expanded context must still remain within its budget.",
  );

  assert(
    expanded.records.some(
      (
        record,
      ) =>
        record.id ===
        "verified-knowledge",
    ),

    "Verified knowledge must become eligible when sufficient budget exists.",
  );

  console.log(
    "003.MEMORY-HEALTH-003 adaptive context expansion: SUCCESS",
  );

  const relevanceFiltered =
    authority.select(
      candidates,
      {
        maxTokens:
          1000,

        minimumRelevance:
          0.8,
      },
    );

  assert(
    !relevanceFiltered.records.some(
      (
        record,
      ) =>
        record.id ===
        "candidate-knowledge",
    ),

    "Low-relevance candidate memory must be excluded even when token budget is available.",
  );

  assert(
    relevanceFiltered.records.length ===
      3,

    "Relevance filtering must retain only sufficiently relevant active memory.",
  );

  console.log(
    "004.MEMORY-HEALTH-003 relevance gate before context admission: SUCCESS",
  );

  const zero =
    authority.select(
      candidates,
      {
        maxTokens:
          1,

        minimumRelevance:
          0.5,
      },
    );

  assert(
    zero.records.length ===
      0,

    "No memory may be selected when no record fits the hard budget.",
  );

  assert(
    zero.estimatedTokens ===
      0,

    "Zero-selection context must consume zero estimated tokens.",
  );

  console.log(
    "005.MEMORY-HEALTH-003 hard budget prevents context overflow: SUCCESS",
  );

  console.log(
    "MEMORY-HEALTH-003 DURABLE MEMORY → RELEVANCE → CONTEXT BUDGET → SELECTED CONTEXT: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    throw error;
  },
);
