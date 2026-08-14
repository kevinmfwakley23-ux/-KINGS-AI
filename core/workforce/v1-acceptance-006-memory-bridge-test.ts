import {
  V1AcceptanceMemoryBridge,
} from "./v1-acceptance-006-memory-bridge";

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
      "checkpoint-v1-acceptance-006",

    missionId:
      "mission-v1-acceptance-006",

    planId:
      "plan-v1-acceptance-006",

    planVersion:
      1,

    state: {
      missionId:
        "mission-v1-acceptance-006",

      activeTaskIds: [],

      completedTaskIds: [
        "task-v1-acceptance-006",
      ],

      blockedTaskIds: [],

      failedTaskIds: [],

      openQuestionIds: [],

      riskIds: [],

      artifactIds: [
        "artifact-v1-acceptance-006",
      ],

      evidenceIds: [
        "evidence-v1-acceptance-006",
      ],

      updatedAt:
        "2026-08-14T02:00:00.000Z",
    },

    summary:
      "Accepted V1-ACCEPTANCE-006 outcome.",

    reason:
      "Acceptance-to-memory checkpoint.",

    createdAt:
      "2026-08-14T02:00:00.000Z",
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

  const acceptanceMemory =
    new V1AcceptanceMemoryBridge(
      missionMemory,
    );

  const acceptanceAuthority =
    new V1AcceptanceAuthority();

  const acceptance =
    acceptanceAuthority.evaluate({
      taskId:
        "task-v1-acceptance-006",

      completion: {
        taskId:
          "task-v1-acceptance-006",

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-v1-acceptance-006",
        ],
      },

      engineeringCompletion: {
        id:
          "completion-v1-acceptance-006",

        projectId:
          "project-kings",

        taskId:
          "task-v1-acceptance-006",

        completed:
          true,

        reason:
          "Required engineering criteria verified.",

        verificationId:
          "verification-v1-acceptance-006",

        unmetCriteria: [],
      },
    });

  assert(
    acceptance.accepted,
    "Acceptance prerequisite must pass.",
  );

  console.log(
    "001.V1-ACCEPTANCE-006 acceptance prerequisite: SUCCESS",
  );

  const ordinary =
    acceptanceMemory.rememberAcceptedOutcome({
      acceptance,

      checkpoint:
        checkpoint(),

      type:
        "decision" as MemoryType,

      authoritative:
        false,

      summary:
        "Task accepted and checkpointed for mission continuity.",

      sourceReferences: [
        "checkpoint-source-v1-acceptance-006",
      ],
    });

  assert(
    ordinary.accepted,
    "Ordinary accepted outcome must be accepted.",
  );

  assert(
    ordinary.registered,
    "Ordinary accepted outcome must be registered.",
  );

  assert(
    !ordinary.authoritative,
    "Ordinary accepted outcome must not automatically become authoritative.",
  );

  console.log(
    "002.V1-ACCEPTANCE-006 accepted outcome → ordinary mission memory: SUCCESS",
  );

  const ordinaryMemory =
    memoryStore.get(
      ordinary.memoryId,
    );

  assert(
    ordinaryMemory !==
      undefined,
    "Ordinary mission memory must be retrievable.",
  );

  assert(
    ordinaryMemory?.missionId ===
      "mission-v1-acceptance-006",
    "Mission identity must be preserved in memory.",
  );

  if (!ordinaryMemory) {
    throw new Error(
      "ASSERTION FAILED: Ordinary mission memory must remain retrievable.",
    );
  }

  assert(
    ordinaryMemory.sourceReferences.includes(
      "evidence-v1-acceptance-006",
    ),
    "Acceptance evidence must be preserved as provenance.",
  );

  console.log(
    "003.V1-ACCEPTANCE-006 mission memory retrieval + provenance: SUCCESS",
  );

  const authoritative =
    acceptanceMemory.rememberAcceptedOutcome({
      acceptance,

      checkpoint:
        {
          ...checkpoint(),

          id:
            "checkpoint-v1-acceptance-006-authoritative",
        },

      type:
        "decision" as MemoryType,

      authoritative:
        true,

      summary:
        "The accepted V1-ACCEPTANCE-006 outcome is authoritative for mission direction.",

      sourceReferences: [
        "human-acceptance-v1-acceptance-006",
      ],
    });

  assert(
    authoritative.accepted,
    "Explicitly authoritative accepted outcome must be accepted.",
  );

  assert(
    authoritative.registered,
    "Explicitly authoritative outcome must be registered.",
  );

  assert(
    authoritative.authoritative,
    "Explicit authoritative outcome must pass the existing promotion path.",
  );

  console.log(
    "004.V1-ACCEPTANCE-006 explicit authoritative promotion: SUCCESS",
  );

  const authoritativeMemories =
    missionMemory.getAuthoritativeMissionMemories(
      "mission-v1-acceptance-006",
    );

  assert(
    authoritativeMemories.length ===
      1,
    "Only the explicit authoritative acceptance outcome should be authoritative.",
  );

  assert(
    authoritativeMemories[0]
      .sourceReferences.includes(
        "verification-v1-acceptance-006",
      ),
    "Authoritative memory must preserve verification provenance.",
  );

  console.log(
    "005.V1-ACCEPTANCE-006 authoritative filtering + provenance: SUCCESS",
  );

  const rejected =
    acceptanceAuthority.evaluate({
      taskId:
        "task-v1-acceptance-006-rejected",

      completion: {
        taskId:
          "task-v1-acceptance-006-rejected",

        passed:
          false,

        reasons: [
          "Verification evidence failed.",
        ],

        evidenceIds: [
          "partial-evidence",
        ],
      },
    });

  const rejectedMemory =
    acceptanceMemory.rememberAcceptedOutcome({
      acceptance:
        rejected,

      checkpoint:
        checkpoint(),

      type:
        "decision" as MemoryType,

      authoritative:
        true,

      summary:
        "Rejected acceptance must not become authoritative memory.",

      sourceReferences: [
        "rejected-source",
      ],
    });

  assert(
    !rejectedMemory.accepted,
    "Rejected acceptance must not be promoted into memory.",
  );

  assert(
    !rejectedMemory.registered,
    "Rejected acceptance must not be registered.",
  );

  assert(
    rejectedMemory.reasons.some(
      (reason) =>
        reason.includes(
          "Acceptance rejected:",
        ),
    ),
    "Rejected acceptance provenance must remain explainable.",
  );

  console.log(
    "006.V1-ACCEPTANCE-006 rejected outcome protection: SUCCESS",
  );

  console.log(
    "V1-ACCEPTANCE-006 ACCEPTANCE → MISSION MEMORY → GOVERNED PROMOTION: SUCCESS",
  );
}

main();
