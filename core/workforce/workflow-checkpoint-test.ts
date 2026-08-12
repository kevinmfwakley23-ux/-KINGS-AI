import {
  WorkflowCheckpointAuthority,
} from "./workflow-checkpoint";

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

function expectFailure(
  action:
    () => void,
  message:
    string,
): void {
  try {
    action();
  } catch {
    return;
  }

  throw new Error(
    `EXPECTED FAILURE: ${message}`,
  );
}

async function main(): Promise<void> {
  const now =
    new Date().toISOString();

  const sessions =
    new RuntimeSessionRegistry();

  sessions.register({
    id:
      "runtime-tree-084",
    ownerId:
      "owner-tree-084",
    environment: {
      id:
        "env-tree-084",
      platform:
        "chromeos",
      hostname:
        "kings-chromebook",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-tree-084",
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

  sessions.register({
    id:
      "runtime-tree-084-replacement",
    ownerId:
      "owner-tree-084",
    environment: {
      id:
        "env-tree-084-replacement",
      platform:
        "linux",
      hostname:
        "kings-linux",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-tree-084-replacement",
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

  sessions.register({
    id:
      "runtime-tree-084-wrong-owner",
    ownerId:
      "different-owner",
    environment: {
      id:
        "env-tree-084-wrong-owner",
      platform:
        "linux",
      hostname:
        "other-machine",
      shell:
        "bash",
      workingDirectory:
        "/tmp",
      terminalId:
        "terminal-tree-084-wrong-owner",
      capabilities: [
        "filesystem",
      ],
    },
    createdAt:
      now,
    updatedAt:
      now,
    active:
      true,
  });

  const authority =
    new WorkflowCheckpointAuthority(
      sessions,
    );

  const checkpoint =
    authority.create({
      id:
        "checkpoint-tree-084",
      workflowId:
        "workflow-tree-084",
      missionId:
        "mission-tree-084",
      ownerId:
        "owner-tree-084",
      execution: {
        id:
          "execution-tree-084",
        missionId:
          "mission-tree-084",
        taskId:
          "task-tree-084",
        agentId:
          "agent-tree-084",
        runtimeSessionId:
          "runtime-tree-084",
        runtimeDefinitionId:
          "runtime-definition-tree-084",
        status:
          "active",
        startedAt:
          now,
        updatedAt:
          now,
        resumeCount:
          0,
      },
      currentTaskId:
        "task-tree-084-next",
      completedTaskIds: [
        "task-tree-084-completed",
      ],
      pendingTaskIds: [
        "task-tree-084-next",
        "task-tree-084-final",
      ],
      createdAt:
        now,
    });

  assert(
    checkpoint.status ===
      "active",
    "Checkpoint must begin active.",
  );

  console.log(
    "08.4 durable workflow checkpoint creation: SUCCESS",
  );

  const paused =
    authority.pause(
      checkpoint.id,
      now,
    );

  assert(
    paused.status ===
      "paused",
    "Checkpoint must preserve paused state.",
  );

  assert(
    paused.completedTaskIds.includes(
      "task-tree-084-completed",
    ),
    "Completed work must remain in the checkpoint.",
  );

  console.log(
    "08.4 workflow interruption checkpoint: SUCCESS",
  );

  expectFailure(
    () =>
      authority.resume({
        checkpointId:
          checkpoint.id,
        ownerId:
          "different-owner",
        replacementRuntimeSessionId:
          "runtime-tree-084-replacement",
        resumedAt:
          now,
      }),
    "A different owner must not resume the workflow.",
  );

  console.log(
    "08.4 owner continuity enforcement: SUCCESS",
  );

  expectFailure(
    () =>
      authority.resume({
        checkpointId:
          checkpoint.id,
        ownerId:
          "owner-tree-084",
        replacementRuntimeSessionId:
          "runtime-tree-084-wrong-owner",
        resumedAt:
          now,
      }),
    "A runtime owned by another owner must be rejected.",
  );

  console.log(
    "08.4 replacement runtime ownership enforcement: SUCCESS",
  );

  const resumed =
    authority.resume({
      checkpointId:
        checkpoint.id,
      ownerId:
        "owner-tree-084",
      replacementRuntimeSessionId:
        "runtime-tree-084-replacement",
      resumedAt:
        now,
    });

  assert(
    resumed.checkpoint.status ===
      "active",
    "Resumed checkpoint must become active.",
  );

  assert(
    resumed.checkpoint.runtimeSessionId ===
      "runtime-tree-084-replacement",
    "Checkpoint must transfer to the replacement runtime.",
  );

  assert(
    resumed.checkpoint.resumeCount ===
      1,
    "Resume count must advance.",
  );

  assert(
    resumed.checkpoint.currentTaskId ===
      "task-tree-084-next",
    "Current task must survive runtime replacement.",
  );

  assert(
    resumed.checkpoint.pendingTaskIds.includes(
      "task-tree-084-final",
    ),
    "Pending work must survive runtime replacement.",
  );

  console.log(
    "08.4 cross-runtime workflow checkpoint resume: SUCCESS",
  );

  const completed =
    authority.complete(
      checkpoint.id,
      now,
    );

  assert(
    completed.status ===
      "completed",
    "Checkpoint must support durable completion.",
  );

  expectFailure(
    () =>
      authority.resume({
        checkpointId:
          checkpoint.id,
        ownerId:
          "owner-tree-084",
        replacementRuntimeSessionId:
          "runtime-tree-084-replacement",
        resumedAt:
          now,
      }),
    "Completed checkpoints must not resume.",
  );

  console.log(
    "08.4 completed workflow resume rejection: SUCCESS",
  );

  console.log(
    "TREE-08.4 WORKFLOW CHECKPOINT / RESUME: SUCCESS",
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
