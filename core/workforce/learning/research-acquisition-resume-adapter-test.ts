import { MissionContinuityStore } from "../mission-continuity";
import { MissionLearningController } from "../mission-learning-controller";
import { CapabilityLearningBridge } from "../capability-learning-bridge";
import { ResearchAcquisitionResumeAdapter } from "./research-acquisition-resume-adapter";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const continuity = new MissionContinuityStore();
  const missionId = "mission-resume-test";
  const taskId = "task-resume-test";
  const planId = "plan-resume-test";
  const now = new Date().toISOString();

  continuity.registerMission({
    id: missionId,
    name: "Resume test",
    description: "Prove verified acquisition releases a blocked task.",
    status: "planned",
    objectives: ["Resume after capability acquisition"],
    sourceReferences: ["test"],
    createdAt: now,
    updatedAt: now,
  });

  continuity.registerPlan({
    id: planId,
    missionId,
    version: 1,
    objective: "Resume after capability acquisition",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: ["Task becomes resumable"],
    locked: true,
    approvedByHuman: true,
    createdAt: now,
    updatedAt: now,
  });

  const learning = new MissionLearningController(continuity, new CapabilityLearningBridge());
  const blocker = learning.blockTask({
    missionId,
    taskId,
    agentId: "agent-test",
    capabilityId: "rust-development",
    language: "rust",
    operations: ["build"],
    gate: {
      ready: false,
      language: "rust",
      missingOperations: ["build"],
      missingExecutables: ["cargo"],
      reason: "cargo is unavailable",
    },
  });

  const adapter = new ResearchAcquisitionResumeAdapter(learning);
  const acquisition = {
    candidate: {
      candidateId: "candidate-test",
      researchId: "research-test",
      sourceId: "source-test",
      sourceUrl: "https://rust-lang.org/",
      content: "verified",
      verified: true as const,
      verificationEvidence: "source:source-test | verification:web-response-integrity",
    },
    acquisitionPlan: {} as never,
    execution: { id: "execution-test" } as never,
    completedPlan: { ready: true } as never,
    completed: true,
    provenance: "execution:execution-test | source:source-test | completed:true",
  };

  const result = adapter.complete({
    learningRecordId: blocker.id,
    capabilityId: "rust-development",
    language: "rust",
    operation: "build",
    acquisition,
  });

  assert(result.toolchainReady, "completed verified acquisition should mark capability ready");
  assert(result.taskReadyToResume, "completed acquisition should release the task for resume");
  assert(result.learnedCapability.sourceId === "source-test", "source provenance must be preserved");
  assert(result.learnedCapability.acquisitionExecutionId === "execution-test", "execution provenance must be preserved");

  const record = learning.get(blocker.id);
  assert(record?.status === "ready-to-resume", "learning record must transition to ready-to-resume");

  let rejected = false;
  try {
    adapter.complete({
      learningRecordId: blocker.id,
      capabilityId: "rust-development",
      language: "rust",
      operation: "build",
      acquisition: { ...acquisition, completed: false },
    });
  } catch {
    rejected = true;
  }

  assert(rejected, "incomplete acquisition must never release the learning blocker");
  console.log("RESEARCH ACQUISITION → CAPABILITY → RESUME: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
