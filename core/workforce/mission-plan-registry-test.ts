import {
  MissionContinuityStore,
} from "./mission-continuity";

import {
  MissionPlanRegistry,
} from "./mission-plan-registry";

import type {
  Mission,
} from "./types";

const now =
  new Date().toISOString();

const continuity =
  new MissionContinuityStore();

const registry =
  new MissionPlanRegistry(
    continuity,
  );

const mission: Mission = {
  id: "MISSION-PLAN-REGISTRY-TEST",
  name: "Plan Registry Test",
  description:
    "Validate governed mission plan revision.",
  status: "active",
  objectives: [
    "Validate plan revision governance.",
  ],
  sourceReferences: [
    "test-source",
  ],
  createdAt: now,
  updatedAt: now,
};

continuity.registerMission(
  mission,
);

registry.registerInitialPlan(
  {
    id: "PLAN-001",
    missionId: mission.id,
    version: 1,
    objective:
      "Complete the original plan.",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: [
      "Original plan completes successfully.",
    ],
    locked: false,
    approvedByHuman: false,
    createdAt: now,
    updatedAt: now,
  },
  "human",
);

continuity.approvePlan(
  mission.id,
);

continuity.lockPlan(
  mission.id,
);

console.log(
  "Initial plan approval and locking: SUCCESS",
);

const revision =
  registry.proposeRevision(
    mission.id,
    {
      id: "PLAN-002",
      missionId: mission.id,
      version: 2,
      objective:
        "Complete the improved plan.",
      milestones: [],
      decisionIds: [],
      acceptanceCriteria: [
        "Improved plan completes successfully.",
      ],
      locked: false,
      approvedByHuman: false,
      createdAt: now,
      updatedAt: now,
    },
    "Improve the project plan.",
    "ai-planner",
  );

if (
  revision.approvedByHuman
) {
  throw new Error(
    "Unapproved revision was accepted as approved",
  );
}

console.log(
  "AI plan revision proposal: SUCCESS",
);

const approved =
  registry.approveAndLockRevision(
    revision.id,
  );

if (
  !approved.approvedByHuman
) {
  throw new Error(
    "Human revision approval failed",
  );
}

if (
  !approved.plan.locked
) {
  throw new Error(
    "Approved revision was not locked",
  );
}

console.log(
  "Human approval and revision locking: SUCCESS",
);

const activated =
  registry.activateRevision(
    revision.id,
  );

if (
  activated.version !== 2
) {
  throw new Error(
    "Plan revision activation failed",
  );
}

if (
  activated.locked !== true
) {
  throw new Error(
    "Activated plan is not locked",
  );
}

console.log(
  "Human-approved locked revision activation: SUCCESS",
);

const current =
  registry.getCurrentPlan(
    mission.id,
  );

if (
  current.version !== 2
) {
  throw new Error(
    "Current plan version is incorrect",
  );
}

console.log(
  "Current plan version: SUCCESS",
);

const revisions =
  registry.listRevisions(
    mission.id,
  );

if (
  revisions.length !== 2
) {
  throw new Error(
    "Plan revision history is incomplete",
  );
}

console.log(
  "Plan revision history: SUCCESS",
);

console.log(
  "INTELLIGENCE-008 mission plan registry: SUCCESS",
);
