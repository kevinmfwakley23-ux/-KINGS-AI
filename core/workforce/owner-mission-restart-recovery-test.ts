import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { OwnerMissionRuntime } from "./owner-mission-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-owner-restart-recovery-"));
  const storePath = join(root, "owner-missions.json");

  try {
    const first = new OwnerMissionRuntime(storePath);
    await first.initialize();
    const created = await first.createMission({
      productName: "Restart Recovery Acceptance",
      ownerVision: "Build a restart-safe governed application mission.",
    });

    const dispatch = await first.dispatchNext(created.mission.id);
    assert(dispatch, "Initial owner task must dispatch before restart simulation.");
    const running = first.snapshot(created.mission.id);
    assert(running.execution.runningTaskIds.length === 1, "Dispatched task must be persisted as running.");
    assert(running.execution.runningTaskIds[0] === dispatch.taskId, "Persisted running task identity must match dispatch.");

    // Simulate an abrupt process loss: no completion/failure transition is
    // written. A fresh runtime must recover the durable running state.
    const restarted = new OwnerMissionRuntime(storePath);
    await restarted.initialize();
    const recovered = restarted.snapshot(created.mission.id);
    const recoveredTask = recovered.tasks.find((task) => task.id === dispatch.taskId);

    assert(recovered.mission.status === "active", "Interrupted mission must return to active rather than being guessed complete.");
    assert(recovered.execution.runningTaskIds.length === 0, "No stale running task may survive process restart.");
    assert(recoveredTask?.status === "ready", "Interrupted task must return to ready for governed retry.");
    assert(recoveredTask?.assignedAgentId === undefined, "Interrupted task must not retain a stale agent assignment.");
    assert(recovered.results.length === 1, "Restart recovery must preserve one explicit interruption result.");
    assert(recovered.results[0].taskId === dispatch.taskId, "Recovery evidence must identify the interrupted task.");
    assert(recovered.results[0].agentId === dispatch.agentId, "Recovery evidence must preserve the interrupted worker identity.");
    assert(recovered.results[0].status === "partial", "Restart recovery is partial evidence, never success.");
    assert(
      recovered.results[0].verificationReferences.includes("owner-runtime-restart-recovery"),
      "Recovery result must carry the canonical restart evidence reference.",
    );

    const retryDispatch = await restarted.dispatchNext(created.mission.id);
    assert(retryDispatch?.taskId === dispatch.taskId, "Normal coordinator must redispatch the recovered task rather than inventing a replacement.");

    // Complete the second simulated crash recovery and prove idempotence: once
    // the task is persisted ready, another clean restart must not append a
    // duplicate recovery result.
    const restartedAgain = new OwnerMissionRuntime(storePath);
    await restartedAgain.initialize();
    const recoveredAgain = restartedAgain.snapshot(created.mission.id);
    assert(recoveredAgain.results.length === 2, "A second actual interrupted dispatch must add exactly one more recovery result.");
    assert(
      recoveredAgain.results.every((result) => result.status === "partial"),
      "Neither interruption may be converted into success.",
    );

    const cleanRestart = new OwnerMissionRuntime(storePath);
    await cleanRestart.initialize();
    const stable = cleanRestart.snapshot(created.mission.id);
    assert(stable.results.length === 2, "Restarting an already recovered ready task must be idempotent.");
    assert(stable.execution.runningTaskIds.length === 0, "Stable restart must remain free of stale running work.");

    console.log("OWNER-MISSION restart interruption evidence: SUCCESS");
    console.log("OWNER-MISSION running -> ready recovery: SUCCESS");
    console.log("OWNER-MISSION restart recovery idempotence: SUCCESS");
    console.log("K.I.N.G.S. OWNER MISSION RESTART RECOVERY: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
