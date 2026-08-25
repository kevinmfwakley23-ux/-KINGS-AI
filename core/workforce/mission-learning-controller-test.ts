import { MissionContinuityStore } from "./mission-continuity";
import { MissionLearningController } from "./mission-learning-controller";
import type { CodingCapabilityGateResult } from "./coding-capability-gate";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const continuity = new MissionContinuityStore();
  continuity.registerMission({
    id: "mission-learning-test",
    name: "Learning test",
    description: "Prove mission learning continuity.",
    status: "planned",
    objectives: ["Prove mission learning continuity."],
    sourceReferences: ["test"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  continuity.registerPlan({
    id: "plan-learning-test",
    missionId: "mission-learning-test",
    version: 1,
    objective: "Prove mission learning continuity.",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: ["learning lifecycle completes"],
    locked: true,
    approvedByHuman: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const gate: CodingCapabilityGateResult = {
    ready: false,
    language: "rust",
    missingOperations: ["build", "test"],
    missingExecutables: ["cargo"],
    reason: "Rust toolchain is unavailable.",
  };

  const controller = new MissionLearningController(continuity);
  const blocked = controller.blockTask({
    missionId: "mission-learning-test",
    taskId: "task-learning-test",
    agentId: "agent-learning-test",
    capabilityId: "rust-development",
    language: "rust",
    operations: ["build", "test"],
    gate,
  });

  assert(blocked.status === "blocked", "task should begin blocked");
  assert(blocked.blocker.resumable === true, "blocked task must remain resumable");
  assert(continuity.getState("mission-learning-test")?.blockedTaskIds.includes("task-learning-test") === true, "continuity must persist blocked task");

  const requested = controller.markResearchRequested(blocked.id);
  assert(requested.status === "research-requested", "research request state should persist");

  const ready = controller.markReadyToResume(blocked.id);
  assert(ready.status === "ready-to-resume", "verified capability should make task resumable");
  assert(continuity.getState("mission-learning-test")?.blockedTaskIds.includes("task-learning-test") === false, "ready task must leave blocked state");

  const resumed = controller.resume(blocked.id);
  assert(resumed.status === "resumed", "task should resume explicitly");
  assert(continuity.getState("mission-learning-test")?.activeTaskIds.includes("task-learning-test") === true, "resumed task must become active");

  console.log("MISSION LEARNING CONTINUITY: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
