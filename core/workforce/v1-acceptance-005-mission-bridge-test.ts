import {
  V1AcceptanceMissionBridge,
} from "./v1-acceptance-005-mission-bridge";

import {
  V1AcceptanceAuthority,
} from "./v1-acceptance-001";

import {
  DurableWorkflowResumeAuthority,
} from "./durable-workflow-resume";

import {
  RuntimeSessionRegistry,
} from "./runtime-session";

import {
  MissionContinuityStore,
} from "./mission-continuity";

import type {
  Mission,
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

function main(): void {
  const now =
    "2026-08-14T01:30:00.000Z";

  const missionContinuity =
    new MissionContinuityStore();

  const mission: Mission = {
    id:
      "mission-v1-acceptance-005",

    name:
      "V1 Acceptance Mission Bridge",

    description:
      "Prove acceptance reaches mission continuity.",

    status:
      "active",

    objectives: [
      "Persist accepted task progress into mission state.",
    ],

    sourceReferences: [
      "v1-acceptance-005-test",
    ],

    createdAt:
      now,

    updatedAt:
      now,
  };

  missionContinuity.registerMission(
    mission,
  );

  missionContinuity.registerPlan({
    id:
      "plan-v1-acceptance-005",

    missionId:
      mission.id,

    version:
      1,

    objective:
      "Persist accepted task completion into mission continuity.",

    milestones: [],

    decisionIds: [],

    acceptanceCriteria: [
      "Accepted task completion must produce a mission checkpoint.",
    ],

    locked:
      false,

    approvedByHuman:
      false,

    createdAt:
      now,

    updatedAt:
      now,
  });

  missionContinuity.approvePlan(
    mission.id,
  );

  missionContinuity.lockPlan(
    mission.id,
  );

  const runtimeSessions =
    new RuntimeSessionRegistry();

  runtimeSessions.register({
    id:
      "runtime-v1-acceptance-005",

    ownerId:
      "owner-v1-acceptance-005",

    environment: {
      id:
        "env-v1-acceptance-005",

      platform:
        "linux",

      hostname:
        "kings-linux",

      shell:
        "bash",

      workingDirectory:
        "/home/kevinmfwakley23/KINGS-AI",

      terminalId:
        "terminal-v1-acceptance-005",

      capabilities: [
        "filesystem",
        "git",
        "typescript",
        "node",
      ],
    },

    createdAt:
      now,

    updatedAt:
      now,

    active:
      true,
  });

  const durable =
    new DurableWorkflowResumeAuthority(
      runtimeSessions,
    );

  durable.register({
    id:
      "workflow-v1-acceptance-005",

    missionId:
      mission.id,

    workflowId:
      "workflow-v1-acceptance-005",

    ownerId:
      "owner-v1-acceptance-005",

    status:
      "running",

    taskStates: [
      {
        taskId:
          "task-v1-acceptance-005",

        status:
          "ready",

        dependencyIds: [],

        evidenceIds: [],

        artifactIds: [],
      },
    ],

    activeTaskId:
      "task-v1-acceptance-005",

    updatedAt:
      now,
  });

  const bridge =
    new V1AcceptanceMissionBridge(
      durable,
      missionContinuity,
    );

  const authority =
    new V1AcceptanceAuthority();

  const acceptance =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-005",

      completion: {
        taskId:
          "task-v1-acceptance-005",

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-v1-acceptance-005",
        ],
      },

      engineeringCompletion: {
        id:
          "completion-v1-acceptance-005",

        projectId:
          "project-kings",

        taskId:
          "task-v1-acceptance-005",

        completed:
          true,

        reason:
          "Required engineering criteria verified.",

        verificationId:
          "verification-v1-acceptance-005",

        unmetCriteria: [],
      },
    });

  assert(
    acceptance.accepted,
    "Acceptance must pass before mission promotion.",
  );

  console.log(
    "001.V1-ACCEPTANCE-005 acceptance prerequisite: SUCCESS",
  );

  const result =
    bridge.recordAcceptedTask({
      workflowId:
        "workflow-v1-acceptance-005",

      taskId:
        "task-v1-acceptance-005",

      acceptance,

      artifactIds: [
        "artifact-v1-acceptance-005",
      ],

      completedAt:
        now,

      updatedAt:
        now,

      missionId:
        mission.id,

      planId:
        "plan-v1-acceptance-005",

      planVersion:
        1,

      checkpointId:
        "checkpoint-v1-acceptance-005",

      checkpointSummary:
        "Accepted task persisted into mission continuity.",

      checkpointReason:
        "Governed acceptance checkpoint.",

      checkpointCreatedAt:
        now,
    });

  assert(
    result.accepted,
    "Accepted task must reach mission continuity.",
  );

  assert(
    result.durableTaskRecorded,
    "Accepted task must be durably recorded.",
  );

  assert(
    result.missionStateRecorded,
    "Mission state must be updated.",
  );

  assert(
    result.checkpointRecorded,
    "Mission checkpoint must be created.",
  );

  assert(
    result.missionState.completedTaskIds.includes(
      "task-v1-acceptance-005",
    ),
    "Mission state must record the completed task.",
  );

  assert(
    result.missionState.evidenceIds.includes(
      "evidence-v1-acceptance-005",
    ),
    "Mission state must preserve acceptance evidence.",
  );

  assert(
    result.missionState.artifactIds.includes(
      "artifact-v1-acceptance-005",
    ),
    "Mission state must preserve artifact identity.",
  );

  assert(
    result.checkpoint.id ===
      "checkpoint-v1-acceptance-005",
    "Mission checkpoint identity must be preserved.",
  );

  assert(
    result.checkpoint.state.completedTaskIds.includes(
      "task-v1-acceptance-005",
    ),
    "Checkpoint must preserve completed task state.",
  );

  assert(
    result.checkpoint.state.evidenceIds.includes(
      "evidence-v1-acceptance-005",
    ),
    "Checkpoint must preserve acceptance evidence.",
  );

  console.log(
    "002.V1-ACCEPTANCE-005 acceptance → mission state: SUCCESS",
  );

  const snapshot =
    missionContinuity.snapshot(
      mission.id,
    );

  assert(
    snapshot.latestCheckpoint?.id ===
      "checkpoint-v1-acceptance-005",
    "Mission snapshot must expose latest acceptance checkpoint.",
  );

  assert(
    snapshot.state.completedTaskIds.includes(
      "task-v1-acceptance-005",
    ),
    "Mission snapshot must retain completed task state.",
  );

  assert(
    snapshot.state.evidenceIds.includes(
      "evidence-v1-acceptance-005",
    ),
    "Mission snapshot must retain acceptance evidence.",
  );

  console.log(
    "003.V1-ACCEPTANCE-005 mission continuity snapshot: SUCCESS",
  );

  const restored =
    missionContinuity.restoreLatestCheckpoint(
      mission.id,
    );

  assert(
    restored.completedTaskIds.includes(
      "task-v1-acceptance-005",
    ),
    "Restored checkpoint must retain accepted completion.",
  );

  assert(
    restored.evidenceIds.includes(
      "evidence-v1-acceptance-005",
    ),
    "Restored checkpoint must retain acceptance evidence.",
  );

  console.log(
    "004.V1-ACCEPTANCE-005 checkpoint restoration: SUCCESS",
  );

  console.log(
    "V1-ACCEPTANCE-005 ACCEPTANCE → MISSION STATE → CHECKPOINT → RESTORE: SUCCESS",
  );
}

main();
