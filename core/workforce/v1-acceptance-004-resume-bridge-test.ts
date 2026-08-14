import {
  V1AcceptanceResumeBridge,
} from "./v1-acceptance-004-resume-bridge";

import {
  V1AcceptanceAuthority,
} from "./v1-acceptance-001";

import {
  DurableWorkflowResumeAuthority,
} from "./durable-workflow-resume";

import {
  RuntimeSessionRegistry,
} from "./runtime-session";

import type {
  ExecutionContinuityRecord,
} from "./execution-continuity";

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

function execution(
  runtimeSessionId:
    string,
):
  ExecutionContinuityRecord {
  return {
    id:
      "execution-v1-acceptance-004",

    missionId:
      "mission-v1-acceptance-004",

    taskId:
      "task-v1-acceptance-004-a",

    agentId:
      "agent-v1-acceptance-004",

    runtimeSessionId,

    runtimeDefinitionId:
      "runtime-definition-v1-acceptance-004",

    status:
      "active",

    startedAt:
      "2026-08-14T00:00:00.000Z",

    updatedAt:
      "2026-08-14T00:10:00.000Z",

    resumeCount:
      1,
  };
}

function recoveredWorkflow(
  runtimeSession:
    string,
) {
  return {
    id:
      "workflow-v1-acceptance-004",

    missionId:
      "mission-v1-acceptance-004",

    workflowId:
      "workflow-v1-acceptance-004",

    ownerId:
      "owner-v1-acceptance-004",

    status:
      "interrupted" as const,

    taskStates: [
      {
        taskId:
          "task-v1-acceptance-004-a",

        status:
          "ready" as const,

        dependencyIds:
          [],

        evidenceIds:
          [],

        artifactIds:
          [],
      },

      {
        taskId:
          "task-v1-acceptance-004-b",

        status:
          "pending" as const,

        dependencyIds: [
          "task-v1-acceptance-004-a",
        ],

        evidenceIds:
          [],

        artifactIds:
          [],
      },

      {
        taskId:
          "task-v1-acceptance-004-c",

        status:
          "pending" as const,

        dependencyIds: [
          "task-v1-acceptance-004-b",
        ],

        evidenceIds:
          [],

        artifactIds:
          [],
      },
    ],

    executionId:
      "execution-v1-acceptance-004",

    runtimeSessionId:
      runtimeSession,

    recoveryId:
      "recovery-v1-acceptance-004",

    updatedAt:
      "2026-08-14T00:10:00.000Z",
  };
}

function main(): void {
  const runtimeSessions =
    new RuntimeSessionRegistry();

  runtimeSessions.register({
    id:
      "runtime-v1-acceptance-004-old",

    ownerId:
      "owner-v1-acceptance-004",

    environment: {
      id:
        "env-v1-acceptance-004-old",

      platform:
        "chromeos",

      hostname:
        "kings-chromebook",

      shell:
        "bash",

      workingDirectory:
        "/home/kevinmfwakley23/KINGS-AI",

      terminalId:
        "terminal-v1-acceptance-004-old",

      capabilities: [
        "filesystem",
        "git",
        "typescript",
        "node",
      ],
    },

    createdAt:
      "2026-08-14T00:00:00.000Z",

    updatedAt:
      "2026-08-14T00:00:00.000Z",

    active:
      true,
  });

  runtimeSessions.register({
    id:
      "runtime-v1-acceptance-004-new",

    ownerId:
      "owner-v1-acceptance-004",

    environment: {
      id:
        "env-v1-acceptance-004-new",

      platform:
        "linux",

      hostname:
        "kings-linux",

      shell:
        "bash",

      workingDirectory:
        "/home/kevinmfwakley23/KINGS-AI",

      terminalId:
        "terminal-v1-acceptance-004-new",

      capabilities: [
        "filesystem",
        "git",
        "typescript",
        "node",
      ],
    },

    createdAt:
      "2026-08-14T00:11:00.000Z",

    updatedAt:
      "2026-08-14T00:11:00.000Z",

    active:
      true,
  });

  const durable =
    new DurableWorkflowResumeAuthority(
      runtimeSessions,
    );

  durable.register(
    recoveredWorkflow(
      "runtime-v1-acceptance-004-old",
    ),
  );

  const bridge =
    new V1AcceptanceResumeBridge(
      durable,
    );

  const authority =
    new V1AcceptanceAuthority();

  const accepted =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-004-a",

      completion: {
        taskId:
          "task-v1-acceptance-004-a",

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-v1-acceptance-004",
        ],
      },

      engineeringCompletion: {
        id:
          "completion-v1-acceptance-004",

        projectId:
          "project-kings",

        taskId:
          "task-v1-acceptance-004-a",

        completed:
          true,

        reason:
          "All required engineering criteria were verified.",

        verificationId:
          "verification-v1-acceptance-004",

        unmetCriteria: [],
      },
    });

  assert(
    accepted.accepted,
    "Acceptance must succeed before resume integration.",
  );

  console.log(
    "001.V1-ACCEPTANCE-004 acceptance prerequisite: SUCCESS",
  );

  const result =
    bridge.process({
      workflowId:
        "workflow-v1-acceptance-004",

      taskId:
        "task-v1-acceptance-004-a",

      acceptance:
        accepted,

      artifactIds: [
        "artifact-v1-acceptance-004",
      ],

      completedAt:
        "2026-08-14T00:12:00.000Z",

      updatedAt:
        "2026-08-14T00:12:00.000Z",

      execution:
        execution(
          "runtime-v1-acceptance-004-new",
        ),

      recovery: {
        id:
          "recovery-v1-acceptance-004",

        executionId:
          "execution-v1-acceptance-004",

        lostRuntimeSessionId:
          "runtime-v1-acceptance-004-old",

        detectedAt:
          "2026-08-14T00:10:00.000Z",

        status:
          "recovered",

        reason:
          "Runtime interruption.",

        recoveredRuntimeSessionId:
          "runtime-v1-acceptance-004-new",

        recoveredAt:
          "2026-08-14T00:12:00.000Z",
      },
    });

  assert(
    result.accepted,
    "Accepted task must remain accepted through resume integration.",
  );

  assert(
    result.durableTaskRecorded,
    "Accepted task must be recorded durably before resume.",
  );

  assert(
    result.resumed,
    "Recovered workflow must resume successfully.",
  );

  assert(
    result.resumedTaskId ===
      "task-v1-acceptance-004-b",
    "Resume must select the next dependency-ready task.",
  );

  assert(
    result.workflow.workflow.activeTaskId ===
      "task-v1-acceptance-004-b",
    "The next task must become the active resumed task.",
  );

  assert(
    result.evidenceIds.includes(
      "evidence-v1-acceptance-004",
    ),
    "Acceptance evidence must survive the resume bridge.",
  );

  assert(
    result.verificationIds.includes(
      "verification-v1-acceptance-004",
    ),
    "Verification identity must survive the resume bridge.",
  );

  console.log(
    "002.V1-ACCEPTANCE-004 accepted work → recovery → next-task resume: SUCCESS",
  );

  const completedTask =
    result.workflow.workflow.taskStates.find(
      (task) =>
        task.taskId ===
        "task-v1-acceptance-004-a",
    );

  if (!completedTask) {
    throw new Error(
      "ASSERTION FAILED: Completed accepted task disappeared during resume.",
    );
  }

  assert(
    completedTask.status ===
      "completed",
    "Completed accepted task must remain completed after resume.",
  );

  assert(
    completedTask.evidenceIds.includes(
      "evidence-v1-acceptance-004",
    ),
    "Completed task evidence must remain attached after resume.",
  );

  console.log(
    "003.V1-ACCEPTANCE-004 completed-task preservation: SUCCESS",
  );

  const rejected =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-004-b",

      completion: {
        taskId:
          "task-v1-acceptance-004-b",

        passed:
          false,

        reasons: [
          "Required verification evidence failed.",
        ],

        evidenceIds: [
          "partial-evidence",
        ],
      },
    });

  assert(
    !rejected.accepted,
    "Rejected work must remain rejected.",
  );

  console.log(
    "004.V1-ACCEPTANCE-004 rejection remains protected during resume lifecycle: SUCCESS",
  );

  console.log(
    "V1-ACCEPTANCE-004 ACCEPTANCE → DURABLE RECOVERY → RESUME → NEXT VALID TASK: SUCCESS",
  );
}

main();
