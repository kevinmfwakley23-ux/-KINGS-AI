import { WorkforceRegistry } from "./registry";
import { WorkforceOrchestrator } from "./workforce-orchestrator";
import type { Task } from "./types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function task(
  id: string,
  missionId: string,
  status: Task["status"],
  dependencyIds: string[],
): Task {
  const now = new Date().toISOString();
  return {
    id,
    missionId,
    name: id,
    description: id,
    requiredCapabilities: ["coding"],
    requiredToolIds: [],
    status,
    dependencyIds,
    inputReferences: [],
    expectedOutputs: ["verification"],
    createdAt: now,
    updatedAt: now,
  };
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const orchestrator = new WorkforceOrchestrator(registry);
  const missionId = "mission-workforce-test";

  registry.registerTask(task("task-foundation", missionId, "ready", []));
  registry.registerTask(task("task-ui", missionId, "queued", ["task-foundation"]));
  registry.registerTask(task("task-tests", missionId, "ready", ["task-foundation"]));
  registry.registerTask(task("task-release", missionId, "ready", ["task-ui", "task-tests"]));

  const initial = orchestrator.snapshot(missionId);
  assert(initial.runnableTaskIds.includes("task-foundation"), "foundation should be runnable");
  assert(!initial.runnableTaskIds.includes("task-ui"), "dependent UI task must wait");
  assert(!initial.runnableTaskIds.includes("task-release"), "release must wait for dependencies");

  const dispatch = orchestrator.dispatchNext(missionId);
  assert(dispatch?.status === "dispatched", "foundation should dispatch");
  assert(dispatch?.taskId === "task-foundation", "foundation should be dispatched first");

  const duplicateSnapshot = orchestrator.snapshot(missionId);
  assert(duplicateSnapshot.activeTaskIds.includes("task-foundation"), "foundation should be active");

  orchestrator.complete("task-foundation");

  const afterFoundation = orchestrator.snapshot(missionId);
  assert(afterFoundation.runnableTaskIds.includes("task-ui"), "UI should become runnable after foundation");
  assert(afterFoundation.runnableTaskIds.includes("task-tests"), "tests should become runnable after foundation");
  assert(!afterFoundation.runnableTaskIds.includes("task-release"), "release must still wait");

  const next = orchestrator.dispatchNext(missionId);
  assert(next?.status === "dispatched", "one runnable task should dispatch");
  assert(next?.taskId === "task-ui" || next?.taskId === "task-tests", "scheduler should select a runnable dependency-free task");

  console.log("WORKFORCE ORCHESTRATOR: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
