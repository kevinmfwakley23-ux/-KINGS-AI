import type {
  Mission,
  Task,
} from "./types";

import {
  WorkforceRegistry,
} from "./registry";

import {
  TaskControl,
} from "./task-control";

import {
  TaskLeaseManager,
} from "./task-lease";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function wait(
  durationMs: number,
): Promise<void> {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, durationMs),
  );
}

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const mission: Mission = {
    id: "mission-control-002",
    name: "Task Lease Test Mission",
    description:
      "Verify exclusive bounded task ownership.",
    status: "active",
    objectives: [
      "Verify task claiming.",
      "Verify lease ownership.",
      "Verify safe lease expiration.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const task: Task = {
    id: "task-control-002",
    missionId: mission.id,
    name: "Task Lease Test",
    description:
      "Verify controlled task ownership.",
    assignedAgentId:
      "agent-control-002",
    requiredCapabilities: [],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "exclusive task ownership",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerMission(
    mission,
  );

  registry.registerTask(
    task,
  );

  const taskControl =
    new TaskControl(
      registry,
    );

  const leaseManager =
    new TaskLeaseManager(
      registry,
      taskControl,
    );

  const lease =
    leaseManager.claim(
      task.id,
      "worker-001",
      60_000,
    );

  assert(
    task.status === "running",
    "Claiming a task should move it to running.",
  );

  assert(
    lease.taskId === task.id,
    "Lease should reference the claimed task.",
  );

  assert(
    lease.ownerId === "worker-001",
    "Lease should identify its owner.",
  );

  assert(
    leaseManager.get(task.id)
      ?.leaseId === lease.leaseId,
    "Active lease should be retrievable.",
  );

  let duplicateClaimRejected =
    false;

  try {
    leaseManager.claim(
      task.id,
      "worker-002",
      60_000,
    );
  } catch {
    duplicateClaimRejected =
      true;
  }

  assert(
    duplicateClaimRejected,
    "A leased task must reject a second claim.",
  );

  let wrongOwnerRejected =
    false;

  try {
    leaseManager.release(
      task.id,
      "worker-002",
    );
  } catch {
    wrongOwnerRejected =
      true;
  }

  assert(
    wrongOwnerRejected,
    "A non-owner must not release a task lease.",
  );

  leaseManager.release(
    task.id,
    "worker-001",
  );

  assert(
    task.status === "ready",
    "Releasing a valid lease should return the task to ready.",
  );

  assert(
    leaseManager.get(task.id)
      === undefined,
    "Released lease should no longer be active.",
  );

  const expiringLease =
    leaseManager.claim(
      task.id,
      "worker-003",
      1,
    );

  assert(
    task.status === "running",
    "Reclaiming a ready task should move it to running.",
  );

  await wait(10);

  const expiredLease =
    leaseManager.get(task.id);

  assert(
    expiredLease === undefined,
    "Expired lease should no longer be active.",
  );

  assert(
    task.status === "ready",
    "Expired lease should return task to ready.",
  );

  const reclaimedLease =
    leaseManager.claim(
      task.id,
      "worker-004",
      60_000,
    );

  assert(
    reclaimedLease.leaseId !==
      expiringLease.leaseId,
    "A reclaimed task should receive a new lease.",
  );

  assert(
    reclaimedLease.ownerId ===
      "worker-004",
    "A reclaimed task should accept a new owner.",
  );

  leaseManager.release(
    task.id,
    "worker-004",
  );

  console.log(
    "Task claim: SUCCESS",
  );

  console.log(
    "Lease ownership: SUCCESS",
  );

  console.log(
    "Duplicate claim rejection: SUCCESS",
  );

  console.log(
    "Unauthorized release rejection: SUCCESS",
  );

  console.log(
    "Lease release: SUCCESS",
  );

  console.log(
    "Lease expiration recovery: SUCCESS",
  );

  console.log(
    "Expired task reclaim: SUCCESS",
  );

  console.log(
    "CONTROL-002 task lease ownership: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "CONTROL-002 task lease ownership: FAILED",
    );
    console.error(error);
    throw error;
  },
);
