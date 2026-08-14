import {
  V1AcceptanceRetrievalBridge,
} from "./v1-acceptance-007-retrieval-bridge";

import {
  V1AcceptanceAuthority,
} from "./v1-acceptance-001";

import {
  MissionMemoryBridge,
} from "./mission-memory-bridge";

import {
  MemoryStore,
} from "./memory-store";

import {
  MemoryPromotionGate,
} from "./memory-promotion-gate";

import {
  MemoryRetrievalExplainabilityAuthority,
} from "./memory-health-007-retrieval-explainability";

import type {
  MissionCheckpoint,
} from "./mission-continuity";

import type {
  MemoryType,
} from "./types";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function checkpoint(): MissionCheckpoint {
  return {
    id:
      "checkpoint-v1-acceptance-007",

    missionId:
      "mission-v1-acceptance-007",

    planId:
      "plan-v1-acceptance-007",

    planVersion:
      1,

    state: {
      missionId:
        "mission-v1-acceptance-007",

      activeTaskIds: [],

      completedTaskIds: [
        "task-v1-acceptance-007",
      ],

      blockedTaskIds: [],

      failedTaskIds: [],

      openQuestionIds: [],

      riskIds: [],

      artifactIds: [
        "artifact-v1-acceptance-007",
      ],

      evidenceIds: [
        "evidence-v1-acceptance-007",
      ],

      updatedAt:
        "2026-08-14T02:30:00.000Z",
    },

    summary:
      "Accepted V1-ACCEPTANCE-007 outcome.",

    reason:
      "Acceptance retrieval integration checkpoint.",

    createdAt:
      "2026-08-14T02:30:00.000Z",
  };
}

function main(): void {
  const memoryStore =
    new MemoryStore();

  const promotionGate =
    new MemoryPromotionGate();

  const missionMemory =
    new MissionMemoryBridge(
      memoryStore,
      promotionGate,
    );

  const explainability =
    new MemoryRetrievalExplainabilityAuthority();

  const bridge =
    new V1AcceptanceRetrievalBridge(
      missionMemory,
      explainability,
    );

  const authority =
    new V1AcceptanceAuthority();

  const acceptance =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-007",

      completion: {
        taskId:
          "task-v1-acceptance-007",

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-v1-acceptance-007",
        ],
      },

      engineeringCompletion: {
        id:
          "completion-v1-acceptance-007",

        projectId:
          "project-kings",

        taskId:
          "task-v1-acceptance-007",

        completed:
          true,

        reason:
          "Required engineering criteria verified.",

        verificationId:
          "verification-v1-acceptance-007",

        unmetCriteria: [],
      },
    });

  assert(
    acceptance.accepted,
    "Acceptance prerequisite must pass.",
  );

  console.log(
    "001.V1-ACCEPTANCE-007 acceptance prerequisite: SUCCESS",
  );

  const admitted =
    bridge.evaluate({
      acceptance,

      checkpoint:
        checkpoint(),

      missionMemoryType:
        "decision" as MemoryType,

      summary:
        "Accepted mission outcome remains relevant to the active task.",

      sourceReferences: [
        "acceptance-source-v1-acceptance-007",
      ],

      relevance:
        1,

      priority:
        1,

      estimatedTokens:
        20,

      authoritative:
        false,

      contextPolicy: {
        maxTokens:
          100,

        minimumRelevance:
          0.5,
      },
    });

  assert(
    admitted.accepted,
    "Accepted outcome must reach retrieval governance.",
  );

  assert(
    admitted.memoryRegistered,
    "Accepted mission memory must be registered before retrieval.",
  );

  assert(
    admitted.retrievalEvaluated,
    "Accepted mission memory must be explainably evaluated.",
  );

  assert(
    admitted.admitted,
    "Relevant accepted mission memory should be admitted when within budget.",
  );

  assert(
    admitted.selection.decisions.length ===
      1,
    "Retrieval must produce exactly one decision for the accepted memory.",
  );

  const decision =
    admitted.selection.decisions[0];

  assert(
    decision.authority ===
      "verified",
    "Retrieval explanation must preserve governed authority.",
  );

  assert(
    decision.provenance.includes(
      "evidence-v1-acceptance-007",
    ),
    "Retrieval explanation must preserve acceptance provenance.",
  );

  assert(
    decision.verificationEvidence.includes(
      "verification-v1-acceptance-007",
    ),
    "Retrieval explanation must preserve verification evidence.",
  );

  console.log(
    "002.V1-ACCEPTANCE-007 accepted outcome → explainable retrieval: SUCCESS",
  );

  const budgetRejected =
    bridge.evaluate({
      acceptance,

      checkpoint:
        {
          ...checkpoint(),

          id:
            "checkpoint-v1-acceptance-007-budget",
        },

      missionMemoryType:
        "decision" as MemoryType,

      summary:
        "Accepted outcome exceeds the available context budget.",

      sourceReferences: [
        "budget-source-v1-acceptance-007",
      ],

      relevance:
        1,

      priority:
        1,

      estimatedTokens:
        200,

      authoritative:
        false,

      contextPolicy: {
        maxTokens:
          50,

        minimumRelevance:
          0.5,
      },
    });

  assert(
    budgetRejected.accepted,
    "Budget rejection must not invalidate the acceptance itself.",
  );

  assert(
    budgetRejected.retrievalEvaluated,
    "Budget-rejected memory must still receive a retrieval decision.",
  );

  assert(
    !budgetRejected.admitted,
    "Memory that exceeds context budget must be rejected.",
  );

  assert(
    budgetRejected.selection.decisions[0].reason.includes(
      "context budget",
    ),
    "Budget rejection must remain explainable.",
  );

  console.log(
    "003.V1-ACCEPTANCE-007 budget rejection explainability: SUCCESS",
  );

  const lowRelevance =
    bridge.evaluate({
      acceptance,

      checkpoint:
        {
          ...checkpoint(),

          id:
            "checkpoint-v1-acceptance-007-relevance",
        },

      missionMemoryType:
        "decision" as MemoryType,

      summary:
        "Accepted outcome is intentionally low relevance.",

      sourceReferences: [
        "relevance-source-v1-acceptance-007",
      ],

      relevance:
        0.1,

      priority:
        1,

      estimatedTokens:
        20,

      authoritative:
        false,

      contextPolicy: {
        maxTokens:
          100,

        minimumRelevance:
          0.5,
      },
    });

  assert(
    !lowRelevance.admitted,
    "Low-relevance accepted memory must not enter active context.",
  );

  assert(
    lowRelevance.selection.decisions[0].reason.includes(
      "relevance",
    ),
    "Low-relevance rejection must remain explainable.",
  );

  console.log(
    "004.V1-ACCEPTANCE-007 relevance gate protection: SUCCESS",
  );

  const rejectedAcceptance =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-007-rejected",

      completion: {
        taskId:
          "task-v1-acceptance-007-rejected",

        passed:
          false,

        reasons: [
          "Verification failed.",
        ],

        evidenceIds: [
          "partial-evidence",
        ],
      },
    });

  const rejected =
    bridge.evaluate({
      acceptance:
        rejectedAcceptance,

      checkpoint:
        checkpoint(),

      missionMemoryType:
        "decision" as MemoryType,

      summary:
        "Rejected outcome must never reach active retrieval.",

      sourceReferences: [
        "rejected-source-v1-acceptance-007",
      ],

      relevance:
        1,

      priority:
        1,

      estimatedTokens:
        10,

      authoritative:
        false,

      contextPolicy: {
        maxTokens:
          100,

        minimumRelevance:
          0.5,
      },
    });

  assert(
    !rejected.accepted,
    "Rejected acceptance must remain rejected.",
  );

  assert(
    !rejected.retrievalEvaluated,
    "Rejected acceptance must not enter retrieval evaluation.",
  );

  assert(
    !rejected.memoryRegistered,
    "Rejected acceptance must not register active mission memory.",
  );

  console.log(
    "005.V1-ACCEPTANCE-007 rejected acceptance blocked before retrieval: SUCCESS",
  );

  console.log(
    "V1-ACCEPTANCE-007 ACCEPTANCE → MEMORY GOVERNANCE → EXPLAINABLE RETRIEVAL: SUCCESS",
  );
}

main();
