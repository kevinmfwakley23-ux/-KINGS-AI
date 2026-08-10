import {
  MissionContinuityStore,
} from "./mission-continuity";

import type {
  Mission,
} from "./types";

const now =
  new Date().toISOString();

const store =
  new MissionContinuityStore();

const mission: Mission = {
  id: "MISSION-008-TEST",
  name: "Continuity Test Mission",
  description:
    "Validate durable mission planning and checkpoint restoration.",
  status: "active",
  objectives: [
    "Prove mission continuity.",
  ],
  sourceReferences: [
    "test-source",
  ],
  createdAt: now,
  updatedAt: now,
};

store.registerMission(mission);

store.registerDecision({
  id: "DECISION-001",
  missionId: mission.id,
  statement:
    "The approved mission plan remains authoritative until human revision.",
  rationale:
    "Mission continuity requires stable project direction.",
  authoritative: true,
  locked: true,
  sourceReferences: [
    "test-source",
  ],
  createdAt: now,
  updatedAt: now,
});

store.registerPlan({
  id: "PLAN-008",
  missionId: mission.id,
  version: 1,
  objective:
    "Establish persistent mission continuity.",
  milestones: [
    {
      id: "MILESTONE-001",
      missionId: mission.id,
      name: "Continuity Foundation",
      objective:
        "Create and restore mission state.",
      taskIds: [
        "TASK-001",
      ],
      dependencyIds: [],
      status: "active",
    },
  ],
  decisionIds: [
    "DECISION-001",
  ],
  acceptanceCriteria: [
    "Mission state can be checkpointed and restored.",
  ],
  locked: false,
  approvedByHuman: false,
  createdAt: now,
  updatedAt: now,
});

const approved =
  store.approvePlan(
    mission.id,
  );

if (!approved.approvedByHuman) {
  throw new Error(
    "Human plan approval failed",
  );
}

const locked =
  store.lockPlan(
    mission.id,
  );

if (!locked.locked) {
  throw new Error(
    "Plan locking failed",
  );
}

console.log(
  "Mission plan approval and locking: SUCCESS",
);

store.updateState(
  mission.id,
  {
    currentMilestoneId:
      "MILESTONE-001",
    activeTaskIds: [
      "TASK-001",
    ],
  },
);

const checkpoint =
  store.createCheckpoint({
    id: "CHECKPOINT-001",
    missionId: mission.id,
    planId: "PLAN-008",
    planVersion: 1,
    state:
      store.getState(
        mission.id,
      )!,
    summary:
      "Mission paused after task assignment.",
    reason:
      "Continuity checkpoint.",
    createdAt: now,
  });

if (
  checkpoint.id !==
  "CHECKPOINT-001"
) {
  throw new Error(
    "Checkpoint creation failed",
  );
}

console.log(
  "Mission checkpoint creation: SUCCESS",
);

store.updateState(
  mission.id,
  {
    activeTaskIds: [],
    completedTaskIds: [
      "TASK-001",
    ],
  },
);

const restored =
  store.restoreLatestCheckpoint(
    mission.id,
  );

if (
  !restored.activeTaskIds.includes(
    "TASK-001",
  )
) {
  throw new Error(
    "Checkpoint restoration failed",
  );
}

if (
  restored.completedTaskIds.includes(
    "TASK-001",
  )
) {
  throw new Error(
    "Checkpoint restored incorrect state",
  );
}

console.log(
  "Mission checkpoint restoration: SUCCESS",
);

const snapshot =
  store.snapshot(
    mission.id,
  );

if (
  snapshot.plan.locked !== true
) {
  throw new Error(
    "Locked plan missing from snapshot",
  );
}

if (
  snapshot.latestCheckpoint?.id !==
  "CHECKPOINT-001"
) {
  throw new Error(
    "Latest checkpoint missing from snapshot",
  );
}

console.log(
  "Mission continuity snapshot: SUCCESS",
);

console.log(
  "INTELLIGENCE-008 mission continuity authority: SUCCESS",
);
