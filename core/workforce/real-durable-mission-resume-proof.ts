import {
  MissionContinuityStore,
  type MissionPlan,
} from "./mission-continuity";

import {
  DurableWorkflowResumeAuthority,
  type DurableWorkflowState,
} from "./durable-workflow-resume";

import {
  RuntimeSessionRegistry,
} from "./runtime-session";

import {
  ExecutionContinuityAuthority,
} from "./execution-continuity";

import {
  SessionRecoveryAuthority,
} from "./session-recovery";

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

function createMission():
  Mission {
  return {
    id:
      "mission-durable-proof",
    name:
      "K.I.N.G.S. Durable Mission Proof",
    description:
      "Prove mission state survives runtime interruption and resumes the next unfinished task.",
    status:
      "active",
    objectives: [
      "Preserve mission continuity across runtime interruption.",
      "Resume the next unfinished task after recovery.",
    ],
    sourceReferences: [
      "KINGS-V1-MASTER-CURRENT-REFERENCE.md",
    ],
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T00:00:00.000Z",
  };
}

function createPlan():
  MissionPlan {
  return {
    id:
      "plan-durable-proof-v1",
    missionId:
      "mission-durable-proof",
    version:
      1,
    objective:
      "Complete two sequential engineering tasks.",
    milestones: [
      {
        id:
          "milestone-durable-proof",
        missionId:
          "mission-durable-proof",
        name:
          "Durable Engineering",
        objective:
          "Prove interruption and continuation.",
        taskIds: [
          "task-one",
          "task-two",
        ],
        dependencyIds: [],
        status:
          "active",
      },
    ],
    decisionIds: [],
    acceptanceCriteria: [
      "Task one completes.",
      "Task two resumes after interruption.",
    ],
    locked:
      false,
    approvedByHuman:
      false,
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T00:00:00.000Z",
  };
}

function registerRuntime(
  registry:
    RuntimeSessionRegistry,
  id:
    string,
):
  string {
  registry.register({
    id,
    ownerId:
      "owner-proof",
    environment: {
      id:
        `environment-${id}`,
      platform:
        "chromeos",
      hostname:
        "kings-proof",
      shell:
        "/bin/bash",
      workingDirectory:
        "/tmp/kings-proof",
      terminalId:
        `terminal-${id}`,
      capabilities: [
        "filesystem",
        "git",
        "typescript",
        "node",
      ],
    },
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T00:00:00.000Z",
    active:
      true,
  });

  return id;
}

async function main(): Promise<void> {
  const missionContinuity =
    new MissionContinuityStore();

  missionContinuity.registerMission(
    createMission(),
  );

  missionContinuity.registerPlan(
    createPlan(),
  );

  missionContinuity.approvePlan(
    "mission-durable-proof",
  );

  missionContinuity.lockPlan(
    "mission-durable-proof",
  );

  const checkpointState =
    missionContinuity.updateState(
      "mission-durable-proof",
      {
        currentMilestoneId:
          "milestone-durable-proof",
        activeTaskIds: [
          "task-two",
        ],
        completedTaskIds: [
          "task-one",
        ],
        evidenceIds: [
          "evidence-before-interruption",
        ],
      },
    );

  missionContinuity.createCheckpoint({
    id:
      "checkpoint-durable-proof-001",
    missionId:
      "mission-durable-proof",
    planId:
      "plan-durable-proof-v1",
    planVersion:
      1,
    state:
      checkpointState,
    summary:
      "Task one completed before simulated interruption.",
    reason:
      "Durable checkpoint before runtime loss.",
    createdAt:
      "2026-08-13T00:00:01.000Z",
  });

  const runtimeSessions =
    new RuntimeSessionRegistry();

  const originalRuntimeSessionId =
    registerRuntime(
      runtimeSessions,
      "runtime-proof-001",
    );

  const replacementRuntimeSessionId =
    registerRuntime(
      runtimeSessions,
      "runtime-proof-002",
    );

  const executionContinuity =
    new ExecutionContinuityAuthority(
      runtimeSessions,
      {
        getCheckpoint() {
          return undefined;
        },
      } as never,
      missionContinuity,
    );

  const execution =
    executionContinuity.start({
      id:
        "execution-durable-proof",
      missionId:
        "mission-durable-proof",
      taskId:
        "task-two",
      agentId:
        "agent-durable-proof",
      runtimeSessionId:
        originalRuntimeSessionId,
      runtimeDefinitionId:
        "runtime-definition-proof",
      startedAt:
        "2026-08-13T00:00:02.000Z",
    });

  const checkpointed =
    executionContinuity.checkpoint({
      executionId:
        execution.id,
      missionCheckpointId:
        "checkpoint-durable-proof-001",
      updatedAt:
        "2026-08-13T00:00:03.000Z",
    });

  assert(
    checkpointed.status ===
      "active",
    "Execution must remain active at the checkpoint boundary.",
  );

  console.log(
    "08.CONTINUITY execution checkpoint attachment: SUCCESS",
  );

  const workflow =
    new DurableWorkflowResumeAuthority(
      runtimeSessions,
    );

  const workflowState:
    DurableWorkflowState = {
    id:
      "workflow-durable-proof",
    missionId:
      "mission-durable-proof",
    workflowId:
      "workflow-durable-proof",
    ownerId:
      "owner-proof",
    status:
      "interrupted",
    taskStates: [
      {
        taskId:
          "task-one",
        status:
          "completed",
        dependencyIds: [],
        completedAt:
          "2026-08-13T00:00:04.000Z",
        evidenceIds: [
          "evidence-task-one",
        ],
        artifactIds: [
          "artifact-task-one",
        ],
      },
      {
        taskId:
          "task-two",
        status:
          "pending",
        dependencyIds: [
          "task-one",
        ],
        evidenceIds: [],
        artifactIds: [],
      },
      {
        taskId:
          "task-three",
        status:
          "pending",
        dependencyIds: [
          "task-two",
        ],
        evidenceIds: [],
        artifactIds: [],
      },
    ],
    executionId:
      execution.id,
    runtimeSessionId:
      originalRuntimeSessionId,
    recoveryId:
      "recovery-durable-proof",
    lastCheckpointAt:
      "2026-08-13T00:00:03.000Z",
    updatedAt:
      "2026-08-13T00:00:04.000Z",
  };

  const registered =
    workflow.register(
      workflowState,
    );

  assert(
    registered.status ===
      "interrupted",
    "Durable workflow must begin the recovery proof in interrupted state.",
  );

  assert(
    registered.taskStates.length ===
      3,
    "Durable workflow must preserve all task states.",
  );

  console.log(
    "08.CONTINUITY interrupted workflow persistence: SUCCESS",
  );

  runtimeSessions.deactivate(
    originalRuntimeSessionId,
  );

  const recoveryAuthority =
    new SessionRecoveryAuthority(
      executionContinuity,
      runtimeSessions,
    );

  const recovery =
    recoveryAuthority.detectRuntimeLoss(
      "recovery-durable-proof",
      execution.id,
      "2026-08-13T00:00:05.000Z",
    );

  assert(
    recovery.status ===
      "recoverable",
    "Runtime loss must create a recoverable recovery record.",
  );

  console.log(
    "08.CONTINUITY runtime-loss detection: SUCCESS",
  );

  const recovered =
    recoveryAuthority.recover(
      recovery.id,
      replacementRuntimeSessionId,
      "2026-08-13T00:00:06.000Z",
    );

  assert(
    recovered.recovery.status ===
      "recovered",
    "Session recovery must complete successfully.",
  );

  assert(
    recovered.execution.status ===
      "active",
    "Recovered execution must become active.",
  );

  assert(
    recovered.execution.resumeCount ===
      1,
    "Execution resume count must increment.",
  );

  assert(
    recovered.execution.missionCheckpointId ===
      "checkpoint-durable-proof-001",
    "Execution must retain mission checkpoint identity.",
  );

  console.log(
    "08.CONTINUITY runtime recovery: SUCCESS",
  );

  const interrupted =
    workflow.markInterrupted(
      workflowState.id,
      execution,
      {
        ...recovery,
        status:
          "recoverable",
      },
      "2026-08-13T00:00:07.000Z",
    );

  assert(
    interrupted.status ===
      "interrupted",
    "Workflow must persist its interruption boundary.",
  );

  console.log(
    "08.CONTINUITY workflow interruption persistence: SUCCESS",
  );

  const resumed =
    workflow.resume(
      workflowState.id,
      {
        ...recovered.execution,
        status:
          "active",
        runtimeSessionId:
          replacementRuntimeSessionId,
      },
      {
        ...recovery,
        status:
          "recovered",
        recoveredRuntimeSessionId:
          replacementRuntimeSessionId,
        recoveredAt:
          "2026-08-13T00:00:06.000Z",
      },
      "2026-08-13T00:00:08.000Z",
    );

  assert(
    resumed.workflow.status ===
      "running",
    "Recovered workflow must return to running state.",
  );

  assert(
    resumed.resumedTaskId ===
      "task-two",
    "Resume must select the next incomplete dependency-ready task.",
  );

  assert(
    resumed.workflow.activeTaskId ===
      "task-two",
    "Workflow must preserve the resumed task identity.",
  );

  console.log(
    "08.CONTINUITY next-task selection after recovery: SUCCESS",
  );

  assert(
    resumed.workflow.taskStates.find(
      (
        task,
      ) =>
        task.taskId ===
        "task-one",
    )?.status ===
      "completed",
    "Completed task must remain completed after recovery.",
  );

  assert(
    resumed.workflow.taskStates.find(
      (
        task,
      ) =>
        task.taskId ===
        "task-three",
    )?.status ===
      "pending",
    "Downstream task must remain pending until task two completes.",
  );

  console.log(
    "08.CONTINUITY completed-work preservation: SUCCESS",
  );

  const completed =
    workflow.recordTaskCompletion(
      workflowState.id,
      "task-two",
      [
        "evidence-task-two",
      ],
      [
        "artifact-task-two",
      ],
      "2026-08-13T00:00:09.000Z",
      "2026-08-13T00:00:09.000Z",
    );

  assert(
    completed.taskStates.find(
      (
        task,
      ) =>
        task.taskId ===
        "task-two",
    )?.status ===
      "completed",
    "Recovered task must persist completion.",
  );

  assert(
    completed.taskStates.find(
      (
        task,
      ) =>
        task.taskId ===
        "task-three",
    )?.status ===
      "ready",
    "Next dependency must become ready after resumed task completion.",
  );

  console.log(
    "08.CONTINUITY post-resume dependency advancement: SUCCESS",
  );

  const restoredState =
    missionContinuity.restoreLatestCheckpoint(
      "mission-durable-proof",
    );

  assert(
    restoredState.lastCheckpointId ===
      "checkpoint-durable-proof-001",
    "Mission checkpoint must restore by identity.",
  );

  assert(
    restoredState.evidenceIds.includes(
      "evidence-before-interruption",
    ),
    "Mission evidence must survive restoration.",
  );

  console.log(
    "08.CONTINUITY mission checkpoint restoration: SUCCESS",
  );

  const snapshot =
    missionContinuity.snapshot(
      "mission-durable-proof",
    );

  assert(
    snapshot.latestCheckpoint?.id ===
      "checkpoint-durable-proof-001",
    "Mission snapshot must preserve checkpoint metadata.",
  );

  assert(
    snapshot.state.evidenceIds.includes(
      "evidence-before-interruption",
    ),
    "Mission snapshot must preserve evidence.",
  );

  console.log(
    "08.CONTINUITY mission snapshot preservation: SUCCESS",
  );

  console.log(
    "TREE-08 DURABLE MISSION INTERRUPTION → RUNTIME RECOVERY → TASK RESUME: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
