import { CapabilityLearningBridge } from "./capability-learning-bridge";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const bridge = new CapabilityLearningBridge();

  const blocker = bridge.createBlocker({
    missionId: "mission-learning-test",
    taskId: "task-learning-test",
    agentId: "agent-learning-test",
    capabilityId: "rust-tooling",
    language: "rust",
    operations: ["build", "test"],
    gate: {
      ready: false,
      language: "rust",
      missingOperations: ["build", "test"],
      missingExecutables: ["cargo"],
      reason: "Registered Rust capability is missing verified runtime requirements.",
    },
  });

  assert(blocker.resumable === true, "capability blocker must preserve resumability");
  assert(blocker.missingExecutables.includes("cargo"), "missing executable must be preserved");
  assert(blocker.researchRequest.ownerApprovalRequired === true, "research must remain approval gated");
  assert(blocker.researchRequest.status === "requested", "research request must begin requested");
  assert(blocker.researchRequest.taskId === "task-learning-test", "research request must remain attached to original task");
  assert(blocker.researchRequest.capabilityId === "rust-tooling", "research request must preserve capability identity");

  console.log("CAPABILITY GAP → GOVERNED LEARNING REQUEST → RESUMABLE BLOCKER: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
