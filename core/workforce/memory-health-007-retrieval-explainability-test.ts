import {
  MemoryRetrievalExplainabilityAuthority,
  type ExplainableMemoryContextCandidate,
} from "./memory-health-007-retrieval-explainability";

import {
  GovernedMemoryStore,
} from "./memory-health-002-enforcement";

import type {
  MemoryLifecycleInput,
} from "./memory-health-001-lifecycle";

function assert(
  condition:
    boolean,

  message:
    string,
):
  asserts condition {
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

  lifecycle:
    MemoryLifecycleInput,
):
  ExplainableMemoryContextCandidate {
  const store =
    new GovernedMemoryStore();

  const record =
    store.write({
      id,

      content:
        `Memory ${id}`,

      lifecycle,

      createdAt:
        "2026-08-13T19:00:00.000Z",
    });

  return {
    record,

    relevance:
      0,

    priority:
      0,

    estimatedTokens:
      0,

    metadata: {
      provenance: [
        `source:${id}`,
        `kind:${lifecycle.kind}`,
      ],

      verificationEvidence:
        lifecycle.verified
          ? [
              `verified:${id}`,
            ]
          : [],
    },
  };
}

async function main():
  Promise<void> {
  const authority =
    new MemoryRetrievalExplainabilityAuthority();

  const mission =
    memory(
      "mission-memory",
      {
        kind:
          "mission-state",

        verified:
          true,

        superseded:
          false,

        missionId:
          "MISSION-MEMORY-HEALTH-007",
      },
    );

  const project =
    memory(
      "project-memory",
      {
        kind:
          "project-state",

        verified:
          true,

        superseded:
          false,

        projectId:
          "KINGS-AI",
      },
    );

  const verified =
    memory(
      "verified-memory",
      {
        kind:
          "fact",

        verified:
          true,

        superseded:
          false,
      },
    );

  const candidate =
    memory(
      "candidate-memory",
      {
        kind:
          "fact",

        verified:
          false,

        superseded:
          false,
      },
    );

  const archived =
    memory(
      "archived-memory",
      {
        kind:
          "historical-record",

        verified:
          true,

        superseded:
          false,
      },
    );

  const candidates:
    ExplainableMemoryContextCandidate[] =
    [
      {
        ...mission,

        relevance:
          1,

        priority:
          1,

        estimatedTokens:
          100,
      },

      {
        ...project,

        relevance:
          0.95,

        priority:
          0.9,

        estimatedTokens:
          100,
      },

      {
        ...verified,

        relevance:
          0.9,

        priority:
          0.8,

        estimatedTokens:
          100,
      },

      {
        ...candidate,

        relevance:
          0.4,

        priority:
          0.2,

        estimatedTokens:
          100,
      },

      {
        ...archived,

        relevance:
          1,

        priority:
          1,

        estimatedTokens:
          100,
      },
    ];

  const result =
    authority.explain(
      candidates,
      {
        maxTokens:
          200,

        minimumRelevance:
          0.5,
      },
    );

  assert(
    result.records.length ===
      2,

    "Context selection must contain only records that fit the budget.",
  );

  console.log(
    "001.MEMORY-HEALTH-007 explainable context selection: SUCCESS",
  );

  assert(
    result.estimatedTokens ===
      200,

    "Explainable selection must report exact context consumption.",
  );

  assert(
    result.budget ===
      200,

    "Explainable selection must preserve the configured context budget.",
  );

  console.log(
    "002.MEMORY-HEALTH-007 context budget accounting: SUCCESS",
  );

  const missionDecision =
    result.decisions.find(
      (
        decision,
      ) =>
        decision.memoryId ===
        "mission-memory",
    );

  assert(
    missionDecision !==
      undefined,

    "Every considered memory must receive an admission decision.",
  );

  assert(
    missionDecision.admitted ===
      true,

    "The highest-value memory must be admitted.",
  );

  assert(
    missionDecision.rank ===
      1,

    "The highest-value memory must receive rank one.",
  );

  assert(
    missionDecision.authority ===
      "verified",

    "Admission explanation must expose memory authority.",
  );

  assert(
    missionDecision.lifecycleClass ===
      "mission",

    "Admission explanation must expose the canonical mission lifecycle.",
  );

  assert(
    missionDecision.retention ===
      "durable",

    "Admission explanation must expose the canonical retention policy.",
  );

  assert(
    missionDecision.active ===
      true,

    "Admission explanation must expose active-context eligibility.",
  );

  assert(
    missionDecision.durable ===
      true,

    "Admission explanation must expose durable-memory status.",
  );

  assert(
    missionDecision.requiresVerification ===
      false,

    "Verified mission state must not require additional verification.",
  );

  assert(
    missionDecision.provenance.length >
      0,

    "Admission explanation must preserve provenance.",
  );

  assert(
    missionDecision.verificationEvidence.length >
      0,

    "Admission explanation must preserve verification evidence.",
  );

  console.log(
    "003.MEMORY-HEALTH-007 admission authority + lifecycle + provenance explanation: SUCCESS",
  );

  const candidateDecision =
    result.decisions.find(
      (
        decision,
      ) =>
        decision.memoryId ===
        "candidate-memory",
    );

  assert(
    candidateDecision !==
      undefined,

    "Low-relevance candidate memory must receive a decision.",
  );

  assert(
    candidateDecision.admitted ===
      false,

    "Low-relevance memory must not enter active context.",
  );

  assert(
    candidateDecision.reason.includes(
      "relevance",
    ),

    "Relevance rejection must be explicitly explained.",
  );

  console.log(
    "004.MEMORY-HEALTH-007 rejection reason explainability: SUCCESS",
  );

  const archivedDecision =
    result.decisions.find(
      (
        decision,
      ) =>
        decision.memoryId ===
        "archived-memory",
    );

  assert(
    archivedDecision !==
      undefined,

    "Archived memory must receive an explicit rejection decision.",
  );

  assert(
    archivedDecision.admitted ===
      false,

    "Archived memory must never enter active context.",
  );

  assert(
    archivedDecision.reason.includes(
      "not active",
    ),

    "Archived-memory rejection must explicitly identify inactive lifecycle state.",
  );

  console.log(
    "005.MEMORY-HEALTH-007 inactive-memory rejection explanation: SUCCESS",
  );

  const verifiedDecision =
    result.decisions.find(
      (
        decision,
      ) =>
        decision.memoryId ===
        "verified-memory",
    );

  assert(
    verifiedDecision !==
      undefined,

    "Budget-excluded verified memory must receive an explicit decision.",
  );

  assert(
    verifiedDecision.admitted ===
      false,

    "Memory that does not fit the remaining budget must be rejected.",
  );

  assert(
    verifiedDecision.reason.includes(
      "budget",
    ),

    "Budget rejection must be explicitly explained.",
  );

  assert(
    verifiedDecision.budgetBefore ===
      0,

    "The decision must preserve the remaining budget at rejection time.",
  );

  console.log(
    "006.MEMORY-HEALTH-007 budget rejection explanation: SUCCESS",
  );

  assert(
    missionDecision.outrankedMemoryIds.includes(
      "project-memory",
    ),

    "Admission explanation must identify lower-scoring memory that was outranked.",
  );

  assert(
    missionDecision.outrankedMemoryIds.includes(
      "verified-memory",
    ),

    "Admission explanation must preserve the ranking comparison set.",
  );

  console.log(
    "007.MEMORY-HEALTH-007 ranking and outranking provenance: SUCCESS",
  );

  assert(
    result.admittedCount ===
      2,

    "Admission count must match the selected context.",
  );

  assert(
    result.rejectedCount ===
      3,

    "Rejected count must account for every excluded memory.",
  );

  console.log(
    "008.MEMORY-HEALTH-007 complete retrieval decision accounting: SUCCESS",
  );

  console.log(
    "MEMORY-HEALTH-007 RETRIEVAL → EXPLANATION → AUTHORITY → BUDGET → AUDITABLE CONTEXT: SUCCESS",
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
