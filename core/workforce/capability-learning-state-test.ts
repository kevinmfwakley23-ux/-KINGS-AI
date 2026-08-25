import { CapabilityLearningStateAuthority } from "./capability-learning-state";
import type { CapabilityLearningBlocker } from "./capability-learning-bridge";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function blocker(): CapabilityLearningBlocker {
  return {
    missionId: "mission-learning-test",
    taskId: "task-learning-test",
    capabilityId: "rust-development",
    language: "rust",
    operations: ["build", "test"],
    reason: "Rust toolchain is not verified on the local runtime.",
    missingExecutables: ["cargo"],
    missingOperations: [],
    researchRequest: {
      id: "research-task-learning-test",
      missionId: "mission-learning-test",
      taskId: "task-learning-test",
      agentId: "agent-learning-test",
      capabilityId: "rust-development",
      question: "Find verified Rust build and test requirements.",
      rationale: "The Rust toolchain is not verified locally.",
      requestedHosts: ["rust-lang.org"],
      requestedSourceTypes: ["official-documentation"],
      maxSources: 3,
      maxDurationMs: 60_000,
      ownerApprovalRequired: true,
      status: "requested",
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
    resumable: true,
  };
}

function main(): void {
  const authority = new CapabilityLearningStateAuthority();
  const created = authority.create(blocker(), "2026-08-25T00:00:00.000Z");
  assert(created.status === "blocked", "new learning state must be blocked");
  assert(created.retryCount === 0, "new learning state must not have retries");

  const approved = authority.markResearchApproved(created);
  const researched = authority.markResearchComplete(approved);
  const verified = authority.markCapabilityVerified(researched);
  const ready = authority.readyToResume(verified);
  assert(ready.status === "ready-to-resume", "verified capability should become resumable");

  const retried = authority.recordRetry(ready);
  assert(retried.retryCount === 1, "resume should increment retry count");

  console.log("CAPABILITY LEARNING STATE: SUCCESS");
}

main();
