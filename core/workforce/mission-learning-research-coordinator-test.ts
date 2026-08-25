import { MissionContinuityStore } from "./mission-continuity";
import { MissionLearningController } from "./mission-learning-controller";
import type { CapabilityLearningBlockerInput } from "./capability-learning-bridge";
import { CodingCapabilityGate } from "./coding-capability-gate";
import { EngineeringCapabilityOrchestrator } from "./engineering-capability-orchestrator";
import { EngineeringToolchainRegistry } from "./engineering-toolchain";
import { MissionLearningResearchCoordinator } from "./mission-learning-research-coordinator";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const continuity = new MissionContinuityStore();
  continuity.registerMission({
    id: "mission-learning-research-test",
    name: "Learning Research Test",
    description: "Prove approved research can release a blocked task.",
    status: "planned",
    objectives: ["Prove learning resume flow"],
    sourceReferences: ["test"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  continuity.registerPlan({
    id: "plan-learning-research-test",
    missionId: "mission-learning-research-test",
    version: 1,
    objective: "Prove learning resume flow",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: ["blocked task becomes resumable after verified research"],
    locked: true,
    approvedByHuman: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const learning = new MissionLearningController(continuity);
  const registry = new EngineeringToolchainRegistry();
  const orchestrator = new EngineeringCapabilityOrchestrator(registry, {
    async discover() {
      return undefined;
    },
  });
  const gate = new CodingCapabilityGate(orchestrator);

  const gateResult = await gate.check({
    language: "rust",
    operations: ["build"],
    probes: [],
  });

  const blockerInput: CapabilityLearningBlockerInput = {
    missionId: "mission-learning-research-test",
    taskId: "task-learning-research-test",
    agentId: "agent-learning-research-test",
    capabilityId: "rust-development",
    language: "rust",
    operations: ["build"],
    gate: gateResult,
  };

  const record = learning.blockTask(blockerInput);
  assert(record.status === "blocked", "learning record should start blocked");

  const policy = {
    assertApproved(input: { approvalId: string }) {
      if (input.approvalId !== "approval-learning-research-test") {
        throw new Error("approval mismatch");
      }
    },
  };

  const gateway = {
    async discover() {
      return {
        candidates: [
          {
            sourceId: "source-rust-official",
            sourceUrl: "https://rust-lang.org/",
            success: true,
            integrityVerified: true,
          },
        ],
      };
    },
  };

  const coordinator = new MissionLearningResearchCoordinator(
    learning,
    policy as never,
    gateway as never,
  );

  const result = await coordinator.execute({
    recordId: record.id,
    approvalId: "approval-learning-research-test",
    ownerId: "project-owner",
    projectId: "mission-learning-research-test",
    taskId: "task-learning-research-test",
    researchId: "research-learning-research-test",
    agentId: "agent-learning-research-test",
    question: "Find verified Rust build knowledge.",
    urls: ["https://rust-lang.org/"],
    maxSources: 1,
  });

  assert(result.readyToResume, "verified research should release the blocker");
  assert(result.sourceIds[0] === "source-rust-official", "verified source identity must be preserved");
  assert(result.record.status === "ready-to-resume", "learning record should become ready to resume");
  assert(continuity.getState("mission-learning-research-test")?.blockedTaskIds.length === 0, "blocked task should leave blocked state");

  console.log("MISSION LEARNING RESEARCH COORDINATOR: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
