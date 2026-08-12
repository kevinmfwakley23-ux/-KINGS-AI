import {
  ExecutionContinuityAuthority,
} from "./execution-continuity";

import {
  SessionRecoveryAuthority,
} from "./session-recovery";

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
      "runtime-tree-082-lost",
    ownerId:
      "owner-tree-082",
    environment: {
      id:
        "env-tree-082-lost",
      platform:
        "chromeos",
      hostname:
        "kings-chromebook",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-tree-082-lost",
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
      "runtime-tree-082-replacement",
    ownerId:
      "owner-tree-082",
    environment: {
      id:
        "env-tree-082-replacement",
      platform:
        "linux",
      hostname:
        "kings-linux",
      shell:
        "bash",
      workingDirectory:
        "/workspace/KINGS-AI",
      terminalId:
        "terminal-tree-082-replacement",
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
      "runtime-tree-082-wrong-owner",
    ownerId:
      "different-owner",
    environment: {
      id:
        "env-tree-082-wrong-owner",
      platform:
        "linux",
      hostname:
        "other-machine",
      shell:
        "bash",
      workingDirectory:
        "/workspace",
      terminalId:
        "terminal-tree-082-wrong-owner",
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

  const continuity =
    new ExecutionContinuityAuthority(
      runtimeSessions,
      new ContextCheckpointStore(),
      new MissionContinuityStore(),
    );

  continuity.start({
    id:
      "execution-tree-082",
    missionId:
      "mission-tree-082",
    taskId:
      "task-tree-082",
    agentId:
      "agent-tree-082",
    runtimeSessionId:
      "runtime-tree-082-lost",
    runtimeDefinitionId:
      "runtime-definition-tree-082",
    startedAt:
      now,
  });

  const recovery =
    new SessionRecoveryAuthority(
      continuity,
      runtimeSessions,
    );

  /*
   * Simulate an unexpected runtime disappearance.
   * The execution itself is still active; only its
   * runtime has become unavailable.
   */
  runtimeSessions.deactivate(
    "runtime-tree-082-lost",
  );

  const detected =
    recovery.detectRuntimeLoss(
      "recovery-tree-082",
      "execution-tree-082",
      now,
    );

  assert(
    detected.status ===
      "recoverable",
    "Lost runtime must produce a recoverable recovery record.",
  );

  assert(
    detected.lostRuntimeSessionId ===
      "runtime-tree-082-lost",
    "Recovery must preserve the lost runtime identity.",
  );

  console.log(
    "08.2 unexpected runtime loss detection: SUCCESS",
  );

  expectFailure(
    () =>
      recovery.recover(
        "recovery-tree-082",
        "runtime-tree-082-wrong-owner",
        now,
      ),
    "Replacement runtime owned by another owner must be rejected.",
  );

  console.log(
    "08.2 owner continuity recovery enforcement: SUCCESS",
  );

  const recovered =
    recovery.recover(
      "recovery-tree-082",
      "runtime-tree-082-replacement",
      now,
    );

  assert(
    recovered.recovery.status ===
      "recovered",
    "Recovery must enter recovered state.",
  );

  assert(
    recovered.execution.status ===
      "active",
    "Recovered execution must return to active state.",
  );

  assert(
    recovered.execution.runtimeSessionId ===
      "runtime-tree-082-replacement",
    "Execution must be transferred to replacement runtime.",
  );

  assert(
    recovered.execution.resumeCount ===
      1,
    "Recovery must use the normal continuity resume path.",
  );

  console.log(
    "08.2 replacement runtime recovery: SUCCESS",
  );

  expectFailure(
    () =>
      recovery.detectRuntimeLoss(
        "recovery-tree-082-active",
        "execution-tree-082",
        now,
      ),
    "An active runtime must not be treated as lost.",
  );

  console.log(
    "08.2 active-runtime false recovery rejection: SUCCESS",
  );

  assert(
    recovery.get(
      "recovery-tree-082",
    )?.recoveredRuntimeSessionId ===
      "runtime-tree-082-replacement",
    "Recovery record must preserve replacement runtime identity.",
  );

  console.log(
    "08.2 durable recovery record: SUCCESS",
  );

  console.log(
    "TREE-08.2 SESSION RECOVERY: SUCCESS",
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
