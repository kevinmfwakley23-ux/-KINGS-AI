import { WorkforceRegistry } from "./registry";
import type { Task, WorkforceResult } from "./types";
import { WorkforceOrchestrator } from "./workforce-orchestrator";
import { WorkforceResultHandoff } from "./workforce-result-handoff";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function task(id: string, missionId: string, status: Task["status"], dependencyIds: string[]): Task {
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
    expectedOutputs: ["verified result"],
    createdAt: now,
    updatedAt: now,
  };
}

function result(taskId: string, status: WorkforceResult["status"]): WorkforceResult {
  return {
    id: `result-${taskId}`,
    taskId,
    agentId: "agent-coder",
    status,
    summary: status === "success" ? "verified" : "failed",
    artifactIds: [],
    verificationReferences: status === "success" ? ["verification-1"] : [],
    createdAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const orchestrator = new WorkforceOrchestrator(registry);
  const handoff = new WorkforceResultHandoff(registry, orchestrator);
  const missionId = "mission-handoff-test";

  registry.registerTask(task("task-build", missionId, "ready", []));
  registry.registerTask(task("task-review", missionId, "ready", ["task-build"]));

  const dispatched = orchestrator.dispatchNext(missionId);
  assert(dispatched?.status === "dispatched", "build should dispatch first");

  const rejected = handoff.accept(result("task-build", "failure"));
  assert(rejected.status === "rejected", "failed result must be rejected");
  assert(!orchestrator.snapshot(missionId).runnableTaskIds.includes("task-review"), "failed task must not unlock review");

  registry.registerTask(task("task-build-2", missionId, "ready", []));
  const dispatchedSecond = orchestrator.dispatchNext(missionId);
  assert(dispatchedSecond?.status === "dispatched", "second build should dispatch");

  const accepted = handoff.accept(result("task-build-2", "success"));
  assert(accepted.status === "accepted", "successful result should be accepted");

  console.log("WORKFORCE RESULT HANDOFF: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
