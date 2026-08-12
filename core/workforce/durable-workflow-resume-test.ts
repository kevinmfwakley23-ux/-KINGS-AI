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

function expectFailure(
  operation:
    () => unknown,
  message:
    string,
): void {
  let failed =
    false;

  try {
    operation();
  } catch {
    failed =
      true;
  }

  assert(
    failed,
    message,
  );
}

function execution(
  status:
    "active"
    | "paused"
    | "completed"
    | "failed",
  runtimeSessionId:
    string,
):
  ExecutionContinuityRecord {
  return {
    id:
      "execution-tree-083",
    missionId:
      "mission-tree-083",
    taskId:
      "task-tree-083",
    agentId:
      "agent-tree-083",
    runtimeSessionId,
    runtimeDefinitionId:
      "runtime-definition-tree-083",
    status,
    startedAt:
      "2026-08-12T00:00:00.000Z",
    updatedAt:
      "2026-08-12T00:10:00.000Z",
    resumeCount:
      1,
  };
}

async function main(): Promise<void> {
  const runtimeSessions =
    new RuntimeSessionRegistry();

  runtimeSessions.register({
    id:
      "runtime-tree-083",
    ownerId:
      "owner-tree-083",
    environment: {
      id:
        "env-tree-083",
      platform:
        "chromeos",
      hostname:
        "kings-chromebook",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-tree-083",
      capabilities: [
        "filesystem",
        "git",
        "typescript",
        "node",
      ],
    },
    createdAt:
      "2026-08-12T00:00:00.000Z",
    updatedAt:
      "2026-08-12T00:00:00.000Z",
    active:
      true,
  });

  runtimeSessions.register({
    id:
      "runtime-tree-083-replacement",
    ownerId:
      "owner-tree-083",
    environment: {
      id:
        "env-tree-083-replacement",
      platform:
        "linux",
      hostname:
        "kings-linux",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-tree-083-replacement",
      capabilities: [
        "filesystem",
        "git",
        "typescript",
        "node",
      ],
    },
    createdAt:
      "2026-08-12T00:11:00.000Z",
    updatedAt:
      "2026-08-12T00:11:00.000Z",
    active:
      true,
  });

  const authority =
    new DurableWorkflowResumeAuthority(
      runtimeSessions,
    );

  const registered =
    authority.register({
      id:
        "workflow-tree-083",
      missionId:
        "mission-tree-083",
      workflowId:
        "workflow-tree-083",
      ownerId:
        "owner-tree-083",
      status:
        "interrupted",
      taskStates: [
        {
          taskId:
            "task-tree-083-a",
          status:
            "completed",
          dependencyIds: [],
          evidenceIds: [
            "evidence-a",
          ],
          artifactIds: [
            "artifact-a",
          ],
          completedAt:
            "2026-08-12T00:05:00.000Z",
        },
        {
          taskId:
            "task-tree-083-b",
          status:
            "pending",
          dependencyIds: [
            "task-tree-083-a",
          ],
          evidenceIds: [],
          artifactIds: [],
        },
        {
          taskId:
            "task-tree-083-c",
          status:
            "pending",
          dependencyIds: [
            "task-tree-083-b",
          ],
          evidenceIds: [],
          artifactIds: [],
        },
      ],
      executionId:
        "execution-tree-083",
      runtimeSessionId:
        "runtime-tree-083",
      recoveryId:
        "recovery-tree-083",
      lastCheckpointAt:
        "2026-08-12T00:10:00.000Z",
      updatedAt:
        "2026-08-12T00:10:00.000Z",
    });

  assert(
    registered.taskStates.length ===
      3,
    "Durable workflow must preserve all task states.",
  );

  console.log(
    "08.3 durable workflow state creation: SUCCESS",
  );

  const interrupted =
    authority.markInterrupted(
      "workflow-tree-083",
      execution(
        "active",
        "runtime-tree-083",
      ),
      {
        id:
          "recovery-tree-083",
        executionId:
          "execution-tree-083",
        lostRuntimeSessionId:
          "runtime-tree-083",
        detectedAt:
          "2026-08-12T00:10:00.000Z",
        status:
          "recoverable",
        reason:
          "Runtime interruption.",
      },
      "2026-08-12T00:11:00.000Z",
    );

  assert(
    interrupted.status ===
      "interrupted",
    "Workflow must become interrupted when runtime recovery begins.",
  );

  console.log(
    "08.3 interrupted workflow persistence: SUCCESS",
  );

  const resumed =
    authority.resume(
      "workflow-tree-083",
      execution(
        "active",
        "runtime-tree-083-replacement",
      ),
      {
        id:
          "recovery-tree-083",
        executionId:
          "execution-tree-083",
        lostRuntimeSessionId:
          "runtime-tree-083",
        detectedAt:
          "2026-08-12T00:10:00.000Z",
        status:
          "recovered",
        reason:
          "Runtime interruption.",
        recoveredRuntimeSessionId:
          "runtime-tree-083-replacement",
        recoveredAt:
          "2026-08-12T00:12:00.000Z",
      },
      "2026-08-12T00:12:00.000Z",
    );

  assert(
    resumed.workflow.status ===
      "running",
    "Recovered workflow must return to running state.",
  );

  assert(
    resumed.resumedTaskId ===
      "task-tree-083-b",
    "Resume must select the next incomplete dependency-ready task.",
  );

  assert(
    resumed.workflow.activeTaskId ===
      "task-tree-083-b",
    "Workflow must preserve the resumed task identity.",
  );

  console.log(
    "08.3 next-task selection after recovery: SUCCESS",
  );

  assert(
    resumed.workflow.taskStates.find(
      (task) =>
        task.taskId ===
        "task-tree-083-a",
    )?.status ===
      "completed",
    "Completed task must remain completed after recovery.",
  );

  assert(
    resumed.workflow.taskStates.find(
      (task) =>
        task.taskId ===
        "task-tree-083-c",
    )?.status ===
      "pending",
    "Blocked downstream task must remain pending.",
  );

  console.log(
    "08.3 completed-work preservation: SUCCESS",
  );

  expectFailure(
    () =>
      authority.resume(
        "workflow-tree-083",
        execution(
          "active",
          "runtime-tree-083-replacement",
        ),
        {
          id:
            "wrong-recovery",
          executionId:
            "execution-tree-083",
          lostRuntimeSessionId:
            "runtime-tree-083",
          detectedAt:
            "2026-08-12T00:10:00.000Z",
          status:
            "recovered",
          reason:
            "Wrong recovery record.",
        },
        "2026-08-12T00:13:00.000Z",
      ),
    "A mismatched recovery record must be rejected.",
  );

  console.log(
    "08.3 recovery identity enforcement: SUCCESS",
  );

  const completed =
    authority.recordTaskCompletion(
      "workflow-tree-083",
      "task-tree-083-b",
      [
        "evidence-b",
      ],
      [
        "artifact-b",
      ],
      "2026-08-12T00:15:00.000Z",
      "2026-08-12T00:15:00.000Z",
    );

  assert(
    completed.taskStates.find(
      (task) =>
        task.taskId ===
        "task-tree-083-b",
    )?.status ===
      "completed",
    "Completed resumed task must persist its completion state.",
  );

  assert(
    completed.taskStates.find(
      (task) =>
        task.taskId ===
        "task-tree-083-c",
    )?.status ===
      "ready",
    "Next dependency should become ready after completion.",
  );

  console.log(
    "08.3 post-resume dependency advancement: SUCCESS",
  );

  expectFailure(
    () =>
      authority.resume(
        "workflow-tree-083",
        execution(
          "completed",
          "runtime-tree-083-replacement",
        ),
        undefined,
        "2026-08-12T00:16:00.000Z",
      ),
    "A completed execution must not be resumed as a workflow.",
  );

  console.log(
    "08.3 completed execution resume rejection: SUCCESS",
  );

  console.log(
    "TREE-08.3 DURABLE WORKFLOW RESUME: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
