import {
  MemoryStore,
} from "./memory-store";

import {
  MemoryPromotionGate,
} from "./memory-promotion-gate";

import {
  MissionMemoryBridge,
} from "./mission-memory-bridge";

import type {
  MemoryType,
} from "./types";

import type {
  MissionDecision,
  MissionPlan,
  MissionState,
  MissionCheckpoint,
} from "./mission-continuity";

const now =
  new Date().toISOString();

const memoryType =
  "decision" as MemoryType;

const store =
  new MemoryStore();

const gate =
  new MemoryPromotionGate();

const bridge =
  new MissionMemoryBridge(
    store,
    gate,
  );

const decision:
  MissionDecision = {
    id: "DECISION-009",
    missionId: "MISSION-009",
    statement:
      "The mission architecture remains governed by the locked plan.",
    rationale:
      "Mission continuity requires an authoritative project direction.",
    authoritative: true,
    locked: true,
    sourceReferences: [
      "human-approval-009",
    ],
    createdAt: now,
    updatedAt: now,
  };

const decisionMemory =
  bridge.rememberDecision(
    decision,
    memoryType,
  );

if (
  !decisionMemory.authoritative
) {
  throw new Error(
    "Locked authoritative decision was not promoted",
  );
}

console.log(
  "Authoritative mission decision memory: SUCCESS",
);

const state:
  MissionState = {
    missionId:
      "MISSION-009",
    activeTaskIds: [
      "TASK-001",
    ],
    completedTaskIds: [],
    blockedTaskIds: [],
    failedTaskIds: [],
    openQuestionIds: [],
    riskIds: [],
    artifactIds: [],
    evidenceIds: [
      "EVIDENCE-009",
    ],
    updatedAt:
      now,
  };

const stateMemory =
  bridge.rememberState(
    state,
    {
      sourceReferences: [
        "checkpoint-source-009",
      ],
    },
    memoryType,
  );

if (
  stateMemory.authoritative
) {
  throw new Error(
    "Mission state was incorrectly promoted to authoritative memory",
  );
}

console.log(
  "Mission state memory: SUCCESS",
);

const plan:
  MissionPlan = {
    id:
      "PLAN-009",
    missionId:
      "MISSION-009",
    version:
      1,
    objective:
      "Build the persistent mission memory system.",
    milestones: [],
    decisionIds: [
      decision.id,
    ],
    acceptanceCriteria: [
      "Mission memory remains recoverable.",
    ],
    locked:
      true,
    approvedByHuman:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };

const planMemory =
  bridge.rememberPlan(
    plan,
    {
      sourceReferences: [
        "human-plan-approval-009",
      ],
    },
    memoryType,
  );

if (
  !planMemory.authoritative
) {
  throw new Error(
    "Approved locked plan was not promoted",
  );
}

console.log(
  "Authoritative mission plan memory: SUCCESS",
);

const checkpoint:
  MissionCheckpoint = {
    id:
      "CHECKPOINT-009",
    missionId:
      "MISSION-009",
    planId:
      "PLAN-009",
    planVersion:
      1,
    state,
    summary:
      "Mission paused with TASK-001 active.",
    reason:
      "Durable continuity checkpoint.",
    createdAt:
      now,
  };

const checkpointMemory =
  bridge.rememberCheckpoint(
    checkpoint,
    memoryType,
  );

if (
  checkpointMemory.authoritative
) {
  throw new Error(
    "Checkpoint was incorrectly promoted to authoritative memory",
  );
}

console.log(
  "Mission checkpoint memory: SUCCESS",
);

const allMemories =
  bridge.getMissionMemories(
    "MISSION-009",
  );

if (
  allMemories.length !== 4
) {
  throw new Error(
    "Mission memory retrieval count is incorrect",
  );
}

console.log(
  "Mission memory retrieval: SUCCESS",
);

const authoritative =
  bridge.getAuthoritativeMissionMemories(
    "MISSION-009",
  );

if (
  authoritative.length !== 2
) {
  throw new Error(
    "Authoritative mission memory count is incorrect",
  );
}

console.log(
  "Authoritative mission memory filtering: SUCCESS",
);

console.log(
  "INTELLIGENCE-009 mission memory bridge: SUCCESS",
);
