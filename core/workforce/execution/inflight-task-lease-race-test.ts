import { strict as assert } from "node:assert";
import type { Mission, Task, WorkforceResult } from "../types";
import { WorkforceRegistry } from "../registry";
import { TaskControl } from "../task-control";
import { TaskLeaseManager } from "../task-lease";
import { TaskExecutionController } from "./task-execution";
import { LeasedTaskExecutionController } from "./leased-task-execution";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const now = new Date().toISOString();

  const mission: Mission = {
    id: "mission-inflight-lease-race",
    name: "In-flight Lease Race Test",
    description: "Verify an expired lease cannot make actively executing work claimable.",
    status: "active",
    objectives: [
      "Hold running state for the full execution window.",
      "Reject a second claim after the original lease expires in-flight.",
    ],
    sourceReferences: [],
    createdAt: now,
    updatedAt: now,
  };

  const task: Task = {
    id: "task-inflight-lease-race",
    missionId: mission.id,
    name: "Long-running coding task",
    description: "Simulate work that outlives a short ownership lease.",
    requiredCapabilities: [],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: ["exclusive in-flight ownership"],
    createdAt: now,
    updatedAt: now,
  };

  registry.registerMission(mission);
  registry.registerTask(task);

  const taskControl = new TaskControl(registry);
  const leaseManager = new TaskLeaseManager(registry);
  const enteredExecution = deferred<void>();
  const finishExecution = deferred<WorkforceResult>();

  const taskExecution = new TaskExecutionController(
    registry,
    taskControl,
    {
      execute: async () => {
        assert.equal(
          task.status,
          "running",
          "execution port must only run after the task has entered running state",
        );
        enteredExecution.resolve(undefined);
        return finishExecution.promise;
      },
    },
  );

  const leasedExecution = new LeasedTaskExecutionController(
    leaseManager,
    taskExecution,
  );

  const firstExecution = leasedExecution.execute(
    task.id,
    "worker-primary",
    1,
  );

  await enteredExecution.promise;
  assert.equal(task.status, "running");

  await wait(10);
  assert.equal(
    leaseManager.get(task.id),
    undefined,
    "short lease should be expired before the reclaim attempt",
  );

  let duplicateClaimRejected = false;
  try {
    leaseManager.claim(
      task.id,
      "worker-secondary",
      60_000,
    );
  } catch (error) {
    duplicateClaimRejected =
      error instanceof Error &&
      error.message.includes("cannot be claimed") &&
      error.message.includes("running");
  }

  assert.equal(
    duplicateClaimRejected,
    true,
    "an expired lease must not make an actively running task claimable",
  );

  finishExecution.resolve({
    id: "result-inflight-lease-race",
    taskId: task.id,
    agentId: "worker-primary",
    status: "success",
    summary: "simulated work completed",
    artifactIds: [],
  });

  const result = await firstExecution;
  assert.equal(result.status, "success");
  assert.equal(task.status, "completed");
  assert.equal(leaseManager.get(task.id), undefined);

  console.log("INFLIGHT-LEASE-001 execution owns running state before adapter work: SUCCESS");
  console.log("INFLIGHT-LEASE-002 expired lease cannot reopen an active task: SUCCESS");
  console.log("INFLIGHT-LEASE-003 task completes after exclusive in-flight execution: SUCCESS");
  console.log("K.I.N.G.S. IN-FLIGHT TASK LEASE RACE: SUCCESS");
}

main().catch((error) => {
  console.error("K.I.N.G.S. IN-FLIGHT TASK LEASE RACE: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
