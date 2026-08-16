import {
  KingsCodingMachine,
  type KingsCodingMissionRequest,
} from "./kings-coding-machine";

import type {
  Mission,
  Task,
} from "./types";

import type {
  MissionPlan,
} from "./mission-continuity";

import {
  TaskControl,
} from "./task-control";

import {
  WorkforceRegistry,
} from "./registry";

const assert: (
  condition: unknown,
  message: string,
) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
};

const now =
  new Date().toISOString();

const mission: Mission = {
  id:
    "mission-kings-machine-test",
  name:
    "K.I.N.G.S. Coding Machine Test",
  description:
    "Verify the canonical mission-to-work-unit planning lifecycle.",
  status:
    "active",
  objectives: [
    "Validate the canonical mission lifecycle.",
    "Produce one governed coding work unit.",
  ],
  sourceReferences: [
    "test://kings-coding-machine",
  ],
  createdAt:
    now,
  updatedAt:
    now,
};

const task: Task = {
  id:
    "task-kings-machine-test",
  missionId:
    mission.id,
  name:
    "Validate machine planning",
  description:
    "Validate the canonical mission-to-work-unit planning path.",
  requiredCapabilities: [
    "engineering-typescript",
  ],
  requiredToolIds: [],
  status:
    "ready",
  dependencyIds: [],
  inputReferences: [],
  expectedOutputs: [
    "A valid work-unit contract.",
  ],
  createdAt:
    now,
  updatedAt:
    now,
};

const plan: MissionPlan = {
  id:
    "plan-kings-machine-test",
  missionId:
    mission.id,
  version:
    1,
  objective:
    "Produce a valid governed work-unit planning result.",
  milestones: [
    {
      id:
        "milestone-kings-machine-test",
      missionId:
        mission.id,
      name:
        "Planning",
      objective:
        "Create and validate the work unit.",
      taskIds: [
        task.id,
      ],
      dependencyIds: [],
      status:
        "active",
    },
  ],
  decisionIds: [],
  acceptanceCriteria: [
    "Work-unit planning succeeds.",
  ],
  locked:
    false,
  approvedByHuman:
    false,
  createdAt:
    now,
  updatedAt:
    now,
};

const request:
  KingsCodingMissionRequest = {
  mission,
  plan,
};

const registry =
  new WorkforceRegistry();

registry.registerTask(
  task,
);

const taskControl =
  new TaskControl(
    registry,
  );

const machine =
  new KingsCodingMachine(
    undefined,
    undefined,
    taskControl,
);

const started =
  machine.startMission(
    request,
  );

assert(
  started.mission.id ===
    mission.id,
  "mission was not registered",
);

assert(
  started.plan.id ===
    plan.id,
  "plan was not registered",
);

assert(
  started.state.missionId ===
    mission.id,
  "mission state was not initialized",
);

const approved =
  machine.approvePlan(
    mission.id,
  );

assert(
  approved.approvedByHuman ===
    true,
  "plan was not approved",
);

const locked =
  machine.lockPlan(
    mission.id,
  );

assert(
  locked.locked ===
    true,
  "plan was not locked",
);

const planned =
  machine.planMission({
    missionPlan:
      locked,
    milestoneId:
      "milestone-kings-machine-test",
    tasks: [
      task,
    ],
    workUnitDefaults: {
      role:
        "engineer",
      capabilityIds: [
        "engineering-typescript",
      ],
      allowedToolIds: [],
      allowedPaths: [
        "generated/kings-machine-test.ts",
      ],
      maxTimeMs:
        30_000,
      maxTokens:
        2_000,
      maxIterations:
        3,
      requiredEvidenceTypes: [
        "planning",
      ],
      approved:
        true,
    },
  });

assert(
  planned.workflow.missionId ===
    mission.id,
  "workflow planning returned the wrong mission",
);

assert(
  planned.workflow.orderedTaskIds.length ===
    1,
  "workflow did not produce one ordered task",
);

assert(
  planned.workUnitContracts[
    task.id
  ] !== undefined,
  "work-unit contract was not created",
);

console.log(
  "K.I.N.G.S. CODING MACHINE MISSION → PLAN → WORK UNIT: SUCCESS",
);
