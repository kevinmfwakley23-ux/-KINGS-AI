import {
  V1AcceptanceDurableBridge,
} from "./v1-acceptance-003-durable-bridge";

import {
  V1AcceptanceAuthority,
} from "./v1-acceptance-001";

import {
  DurableWorkflowResumeAuthority,
} from "./durable-workflow-resume";

import {
  RuntimeSessionRegistry,
} from "./runtime-session";

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

function workflowState() {
  return {
    id:
      "workflow-v1-acceptance-003",

    missionId:
      "mission-v1-acceptance-003",

    workflowId:
      "workflow-v1-acceptance-003",

    ownerId:
      "owner-v1-acceptance-003",

    status:
      "running" as const,

    taskStates: [
      {
        taskId:
          "task-v1-acceptance-003-a",

        status:
          "ready" as const,

        dependencyIds: [],

        evidenceIds: [],

        artifactIds: [],
      },

      {
        taskId:
          "task-v1-acceptance-003-b",

        status:
          "pending" as const,

        dependencyIds: [
          "task-v1-acceptance-003-a",
        ],

        evidenceIds: [],

        artifactIds: [],
      },
    ],

    activeTaskId:
      "task-v1-acceptance-003-a",

    updatedAt:
      "2026-08-13T23:00:00.000Z",
  };
}

function main(): void {
  const runtimeSessions =
    new RuntimeSessionRegistry();

  const durable =
    new DurableWorkflowResumeAuthority(
      runtimeSessions,
    );

  const registered =
    durable.register(
      workflowState(),
    );

  const bridge =
    new V1AcceptanceDurableBridge(
      durable,
    );

  const authority =
    new V1AcceptanceAuthority();

  const accepted =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-003-a",

      completion: {
        taskId:
          "task-v1-acceptance-003-a",

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-typecheck-003",
          "evidence-runtime-003",
        ],
      },

      engineeringCompletion: {
        id:
          "completion-task-v1-acceptance-003-a",

        projectId:
          "project-kings",

        taskId:
          "task-v1-acceptance-003-a",

        completed:
          true,

        reason:
          "All required engineering criteria have verified evidence.",

        verificationId:
          "verification-v1-acceptance-003",

        unmetCriteria: [],
      },
    });

  assert(
    accepted.accepted,
    "Acceptance should succeed before durable recording.",
  );

  const recorded =
    bridge.recordAcceptance({
      workflowId:
        "workflow-v1-acceptance-003",

      taskId:
        "task-v1-acceptance-003-a",

      acceptance:
        accepted,

      artifactIds: [
        "artifact-v1-acceptance-003",
      ],

      completedAt:
        "2026-08-13T23:01:00.000Z",

      updatedAt:
        "2026-08-13T23:01:00.000Z",
    });

  assert(
    recorded.accepted,
    "Accepted work must be recorded durably.",
  );

  assert(
    recorded.workflow.taskStates.find(
      (task) =>
        task.taskId ===
        "task-v1-acceptance-003-a",
    )?.status ===
      "completed",
    "Accepted task must become durably completed.",
  );

  const recordedTask =
    recorded.workflow.taskStates.find(
      (task) =>
        task.taskId ===
        "task-v1-acceptance-003-a",
    );

  if (!recordedTask) {
    throw new Error(
      "ASSERTION FAILED: Recorded task must remain present in durable workflow state.",
    );
  }

  assert(
    recordedTask.evidenceIds.includes(
      "evidence-typecheck-003",
    ),
    "Acceptance evidence must be persisted in durable workflow state.",
  );

  assert(
    recordedTask.artifactIds.includes(
      "artifact-v1-acceptance-003",
    ),
    "Accepted artifact identity must be persisted.",
  );

  console.log(
    "001.V1-ACCEPTANCE-003 accepted work → durable completion: SUCCESS",
  );

  const rejected =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-003-a",

      completion: {
        taskId:
          "task-v1-acceptance-003-a",

        passed:
          false,

        reasons: [
          "Runtime evidence failed.",
        ],

        evidenceIds: [
          "evidence-typecheck-003",
        ],
      },
    });

  const rejectedResult =
    bridge.recordAcceptance({
      workflowId:
        "workflow-v1-acceptance-003",

      taskId:
        "task-v1-acceptance-003-a",

      acceptance:
        rejected,

      artifactIds: [],

      completedAt:
        "2026-08-13T23:02:00.000Z",

      updatedAt:
        "2026-08-13T23:02:00.000Z",
    });

  assert(
    !rejectedResult.accepted,
    "Rejected acceptance must not be durably promoted to completion.",
  );

  assert(
    rejectedResult.reasons.some(
      (reason) =>
        reason.includes(
          "Acceptance rejected:",
        ),
    ),
    "Acceptance rejection provenance must be preserved.",
  );

  console.log(
    "002.V1-ACCEPTANCE-003 rejected acceptance blocked from durable promotion: SUCCESS",
  );

  const freshSnapshot =
    durable.register({
      id:
        "workflow-v1-acceptance-003-fresh",

      missionId:
        "mission-v1-acceptance-003",

      workflowId:
        "workflow-v1-acceptance-003-fresh",

      ownerId:
        "owner-v1-acceptance-003",

      status:
        "running",

      taskStates: [
        {
          taskId:
            "task-v1-acceptance-003-fresh-a",

          status:
            "completed",

          dependencyIds: [],

          evidenceIds: [
            "evidence-persisted",
          ],

          artifactIds: [
            "artifact-persisted",
          ],

          completedAt:
            "2026-08-13T23:03:00.000Z",
        },

        {
          taskId:
            "task-v1-acceptance-003-fresh-b",

          status:
            "pending",

          dependencyIds: [
            "task-v1-acceptance-003-fresh-a",
          ],

          evidenceIds: [],

          artifactIds: [],
        },
      ],

      updatedAt:
        "2026-08-13T23:03:00.000Z",
    });

  const reconstructedTask =
    freshSnapshot.taskStates.find(
      (task) =>
        task.taskId ===
        "task-v1-acceptance-003-fresh-a",
    );

  if (!reconstructedTask) {
    throw new Error(
      "ASSERTION FAILED: Reconstructed task must remain present after durable restoration.",
    );
  }

  assert(
    reconstructedTask.evidenceIds.includes(
      "evidence-persisted",
    ),
    "Durable reconstruction must preserve evidence IDs.",
  );

  assert(
    reconstructedTask.artifactIds.includes(
      "artifact-persisted",
    ),
    "Durable reconstruction must preserve artifact IDs.",
  );

  console.log(
    "003.V1-ACCEPTANCE-003 durable state reconstruction: SUCCESS",
  );

  assert(
    registered.taskStates.length ===
      2,
    "Original durable workflow must retain all task states.",
  );

  console.log(
    "004.V1-ACCEPTANCE-003 workflow state preservation: SUCCESS",
  );

  console.log(
    "V1-ACCEPTANCE-003 ACCEPTANCE → DURABLE WORKFLOW STATE: SUCCESS",
  );
}

main();
