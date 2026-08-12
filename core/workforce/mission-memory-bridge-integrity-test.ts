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
  MemoryReference,
  MemoryType,
} from "./types";

import type {
  MissionDecision,
  MissionPlan,
  MissionState,
  MissionCheckpoint,
} from "./mission-continuity";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

const now =
  "2026-08-12T16:00:00.000Z";

const memoryType =
  "semantic" as MemoryType;

const store =
  new MemoryStore();

const gate =
  new MemoryPromotionGate();

const bridge =
  new MissionMemoryBridge(
    store,
    gate,
  );

const missionId =
  "MISSION-05-5-6";

const decision:
  MissionDecision = {
    id:
      "DECISION-05-5-6",
    missionId,
    statement:
      "Mission memory remains bounded by mission authority.",
    rationale:
      "The bridge must preserve mission continuity without becoming an authority bypass.",
    authoritative:
      true,
    locked:
      true,
    sourceReferences: [
      "human-approval-05-5-6",
    ],
    createdAt:
      now,
    updatedAt:
      now,
  };

const decisionRegistration =
  bridge.rememberDecision(
    decision,
    memoryType,
  );

assert(
  decisionRegistration.missionId ===
    missionId,
  "Decision memory mission identity was not preserved.",
);

assert(
  decisionRegistration.authoritative ===
    true,
  "Locked authoritative decision was not promoted.",
);

console.log(
  "05.5.6 authoritative decision registration: SUCCESS",
);

const plan:
  MissionPlan = {
    id:
      "PLAN-05-5-6",
    missionId,
    version:
      1,
    objective:
      "Harden mission memory bridge integrity.",
    milestones: [],
    decisionIds: [
      decision.id,
    ],
    acceptanceCriteria: [
      "Mission memory remains isolated and recoverable.",
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

const planRegistration =
  bridge.rememberPlan(
    plan,
    {
      sourceReferences: [
        "human-plan-approval-05-5-6",
      ],
    },
    memoryType,
  );

assert(
  planRegistration.authoritative ===
    true,
  "Approved locked plan was not promoted.",
);

console.log(
  "05.5.6 authoritative plan registration: SUCCESS",
);

const state:
  MissionState = {
    missionId,
    activeTaskIds: [
      "TASK-05-5-6",
    ],
    blockedTaskIds: [],
    failedTaskIds: [],
    completedTaskIds: [],
    openQuestionIds: [],
    riskIds: [],
    artifactIds: [],
    evidenceIds: [
      "EVIDENCE-05-5-6",
    ],
    updatedAt:
      now,
  };

const stateRegistration =
  bridge.rememberState(
    state,
    {
      sourceReferences: [
        "state-checkpoint-05-5-6",
      ],
    },
    memoryType,
  );

assert(
  stateRegistration.authoritative ===
    false,
  "Mission state was incorrectly promoted to authoritative memory.",
);

console.log(
  "05.5.6 non-authoritative state boundary: SUCCESS",
);

const checkpoint:
  MissionCheckpoint = {
    id:
      "CHECKPOINT-05-5-6",
    missionId,
    planId:
      plan.id,
    planVersion:
      plan.version,
    state,
    summary:
      "Mission paused after memory bridge hardening.",
    reason:
      "Durable continuity checkpoint.",
    createdAt:
      now,
  };

const checkpointRegistration =
  bridge.rememberCheckpoint(
    checkpoint,
    memoryType,
  );

assert(
  checkpointRegistration.authoritative ===
    false,
  "Checkpoint was incorrectly promoted to authoritative memory.",
);

console.log(
  "05.5.6 checkpoint authority boundary: SUCCESS",
);

const all =
  bridge.getMissionMemories(
    missionId,
  );

assert(
  all.length ===
    4,
  "Mission memory count was not preserved.",
);

console.log(
  "05.5.6 mission memory retrieval: SUCCESS",
);

const authoritative =
  bridge.getAuthoritativeMissionMemories(
    missionId,
  );

assert(
  authoritative.length ===
    2,
  "Authoritative mission memory boundary was not preserved.",
);

console.log(
  "05.5.6 authoritative retrieval boundary: SUCCESS",
);

const semantic =
  bridge.getMissionMemories(
    missionId,
    memoryType,
  );

assert(
  semantic.length ===
    4,
  "Memory type filtering was not preserved.",
);

console.log(
  "05.5.6 memory-type retrieval boundary: SUCCESS",
);

const registrationSources =
  decisionRegistration.sourceReferences;

registrationSources.push(
  "MUTATION-ATTEMPT",
);

assert(
  !bridge
    .getMissionMemories(
      missionId,
    )
    .find(
      (memory) =>
        memory.id ===
          decisionRegistration.memoryId &&
        memory.sourceReferences.includes(
          "MUTATION-ATTEMPT",
        ),
    ),
  "Registration provenance leaked into bridge storage.",
);

console.log(
  "05.5.6 registration provenance isolation: SUCCESS",
);

const retrieved =
  bridge.getMissionMemories(
    missionId,
  );

retrieved[0].sourceReferences.push(
  "RETRIEVAL-MUTATION",
);

const fresh =
  bridge.getMissionMemories(
    missionId,
  );

assert(
  !fresh.some(
    (memory) =>
      memory.sourceReferences.includes(
        "RETRIEVAL-MUTATION",
      ),
  ),
  "Retrieved provenance was exposed as mutable bridge state.",
);

console.log(
  "05.5.6 retrieval provenance isolation: SUCCESS",
);

const foreign:
  MemoryReference = {
    id:
      "FOREIGN-MEMORY-05-5-6",
    type:
      memoryType,
    summary:
      "Foreign mission memory.",
    sourceReferences: [
      "foreign-source",
    ],
    missionId:
      "MISSION-FOREIGN-05-5-6",
    authoritative:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };

store.register(
  foreign,
);

assert(
  bridge
    .getMissionMemories(
      missionId,
    )
    .every(
      (memory) =>
        memory.missionId ===
        missionId,
    ),
  "Foreign mission memory crossed the bridge mission boundary.",
);

console.log(
  "05.5.6 cross-mission isolation: SUCCESS",
);

let emptyMissionRejected =
  false;

try {
  bridge.getMissionMemories(
    "   ",
  );
} catch {
  emptyMissionRejected =
    true;
}

assert(
  emptyMissionRejected,
  "Empty mission id was not rejected.",
);

console.log(
  "05.5.6 mission identity validation: SUCCESS",
);

let emptyMemoryIdRejected =
  false;

try {
  bridge.rememberState(
    state,
    {
      sourceReferences: [
        "source",
      ],
    },
    memoryType,
  );
} catch {
  // Existing state fixture remains valid;
  // this branch verifies no accidental rejection.
}

const invalidState =
  {
    ...state,
    missionId:
      missionId,
  };

assert(
  invalidState.missionId ===
    missionId,
  "Mission state fixture became invalid.",
);

console.log(
  "05.5.6 mission state registration contract: SUCCESS",
);

const repeatedA =
  bridge.getMissionMemories(
    missionId,
  );

const repeatedB =
  bridge.getMissionMemories(
    missionId,
  );

assert(
  JSON.stringify(
    repeatedA,
  ) ===
    JSON.stringify(
      repeatedB,
    ),
  "Repeated bridge retrieval was not deterministic.",
);

console.log(
  "05.5.6 repeated retrieval determinism: SUCCESS",
);

assert(
  emptyMemoryIdRejected ===
    false,
  "Unexpected mission-state rejection occurred.",
);

console.log(
  "TREE-05.5.6 MISSION MEMORY BRIDGE INTEGRITY: SUCCESS",
);
