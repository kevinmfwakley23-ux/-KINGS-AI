import {
  ExecutionContinuityAuthority,
} from "./execution-continuity";

import {
  RuntimeSessionRegistry,
} from "./runtime-session";

import {
  ContextCheckpointStore,
} from "./context-checkpointing";

import {
  MissionContinuityStore,
} from "./mission-continuity";

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

async function main(): Promise<void> {
  const now =
    new Date().toISOString();

  const runtimeSessions =
    new RuntimeSessionRegistry();

  runtimeSessions.register({
    id:
      "runtime-tree-081-a",
    ownerId:
      "owner-tree-081",
    environment: {
      id:
        "env-tree-081-a",
      platform:
        "chromeos",
      hostname:
        "kings-chromebook",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-tree-081-a",
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

  runtimeSessions.register({
    id:
      "runtime-tree-081-b",
    ownerId:
      "owner-tree-081",
    environment: {
      id:
        "env-tree-081-b",
      platform:
        "linux",
      hostname:
        "kings-linux",
      shell:
        "bash",
      workingDirectory:
        "/workspace/KINGS-AI",
      terminalId:
        "terminal-tree-081-b",
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

  runtimeSessions.register({
    id:
      "runtime-tree-081-other-owner",
    ownerId:
      "different-owner",
    environment: {
      id:
        "env-tree-081-other",
      platform:
        "linux",
      hostname:
        "other-machine",
      shell:
        "bash",
      workingDirectory:
        "/workspace",
      terminalId:
        "terminal-tree-081-other",
      capabilities: [
        "typescript",
      ],
    },
    createdAt:
      now,
    updatedAt:
      now,
    active:
      true,
  });

  const contextCheckpoints =
    new ContextCheckpointStore();

  const missionContinuity =
    new MissionContinuityStore();

  const continuity =
    new ExecutionContinuityAuthority(
      runtimeSessions,
      contextCheckpoints,
      missionContinuity,
    );

  const execution =
    continuity.start({
      id:
        "execution-tree-081",
      missionId:
        "mission-tree-081",
      taskId:
        "task-tree-081",
      agentId:
        "agent-tree-081",
      runtimeSessionId:
        "runtime-tree-081-a",
      runtimeDefinitionId:
        "runtime-definition-tree-081",
      startedAt:
        now,
    });

  assert(
    execution.status ===
      "active",
    "Execution must begin active.",
  );

  assert(
    execution.runtimeSessionId ===
      "runtime-tree-081-a",
    "Initial runtime session must be preserved.",
  );

  console.log(
    "08.1 execution continuity creation: SUCCESS",
  );

  const paused =
    continuity.pause(
      execution.id,
      now,
    );

  assert(
    paused.status ===
      "paused",
    "Execution must enter paused state.",
  );

  console.log(
    "08.1 execution pause state: SUCCESS",
  );

  const resumed =
    continuity.resume(
      execution.id,
      "runtime-tree-081-b",
      now,
    );

  assert(
    resumed.execution.status ===
      "active",
    "Execution must return to active state after resume.",
  );

  assert(
    resumed.execution.runtimeSessionId ===
      "runtime-tree-081-b",
    "Execution must resume on the new runtime.",
  );

  assert(
    resumed.execution.resumeCount ===
      1,
    "Resume count must increment.",
  );

  assert(
    resumed.runtime.id ===
      "runtime-tree-081-b",
    "Resolved runtime must match the resumed runtime.",
  );

  console.log(
    "08.1 cross-runtime resume: SUCCESS",
  );

  continuity.pause(
    execution.id,
    now,
  );

  expectFailure(
    () =>
      continuity.resume(
        execution.id,
        "runtime-tree-081-other-owner",
        now,
      ),
    "A different owner runtime must be rejected.",
  );

  console.log(
    "08.1 owner continuity enforcement: SUCCESS",
  );

  continuity.resume(
    execution.id,
    "runtime-tree-081-a",
    now,
  );

  const completed =
    continuity.complete(
      execution.id,
      now,
    );

  assert(
    completed.status ===
      "completed",
    "Execution must complete from active state.",
  );

  assert(
    completed.completedAt ===
      now,
    "Completion timestamp must be recorded.",
  );

  console.log(
    "08.1 execution completion: SUCCESS",
  );

  expectFailure(
    () =>
      continuity.resume(
        execution.id,
        "runtime-tree-081-a",
        now,
      ),
    "Completed execution must not be resumed.",
  );

  console.log(
    "08.1 completed execution resume rejection: SUCCESS",
  );

  console.log(
    "TREE-08.1 EXECUTION CONTINUITY: SUCCESS",
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
