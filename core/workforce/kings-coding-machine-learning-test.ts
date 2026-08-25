import { KingsCodingMachine } from "./kings-coding-machine";
import { MissionContinuityStore } from "./mission-continuity";
import { WorkUnitRegistry } from "./work-unit-registry";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function now(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  const continuity = new MissionContinuityStore();
  const machine = new KingsCodingMachine(
    continuity,
    undefined,
    {
      validate: () => true,
    },
    new WorkUnitRegistry(),
  );

  const missionId = "mission-kings-learning-integration";
  const taskId = "task-rust-build";
  const stepId = "execution-rust-build-step-1";

  machine.startMission({
    mission: {
      id: missionId,
      name: "Learning integration",
      description: "Prove blocked engineering work becomes durable learning state.",
      status: "planned",
      objectives: ["Prove blocked engineering work becomes durable learning state."],
      sourceReferences: ["test"],
      createdAt: now(),
      updatedAt: now(),
    },
    plan: {
      id: "plan-kings-learning-integration",
      missionId,
      version: 1,
      objective: "Prove learning integration.",
      milestones: [],
      decisionIds: [],
      acceptanceCriteria: ["capability failure creates durable learning state"],
      locked: true,
      approvedByHuman: true,
      createdAt: now(),
      updatedAt: now(),
    },
  });

  const execution = {
    id: "execution-rust-build",
    projectId: missionId,
    currentStepId: stepId,
    status: "ready" as const,
    steps: [
      {
        id: stepId,
        language: "rust" as const,
        operation: "build" as const,
        capabilityId: "engineering-rust",
        sequence: 1,
      },
    ],
    completedStepIds: [],
    blockedReasons: [],
  };

  try {
    await machine.executeEngineeringStep(
      {
        missionId,
        projectId: missionId,
        execution,
        step: execution.steps[0],
        workspace: {
          id: "workspace-learning",
          projectId: missionId,
          rootPath: "/tmp/kings-learning",
          allowedPaths: ["."],
          allowedLanguages: ["rust"],
          allowedOperations: ["build"],
          active: true,
        },
        toolchain: {
          id: "missing-rust-toolchain",
          language: "rust",
          displayName: "Missing Rust toolchain",
          fileExtensions: [".rs"],
          commands: [
            {
              operation: "build",
              command: "/definitely/missing/cargo",
              args: [],
              requiresCompilation: true,
            },
          ],
          enabled: true,
        },
        completedAt: now(),
      },
      async () => {
        throw new Error("executor should not run when capability is blocked");
      },
    );

    throw new Error("Expected capability learning blocker");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes("Learning record:"), "execution failure should expose the learning record id");
    assert(message.includes("Research request:"), "execution failure should expose the research request id");
  }

  const snapshot = machine.snapshot(missionId);
  assert(snapshot.state.blockedTaskIds.includes(stepId), "blocked engineering step must persist in mission state");
  assert((snapshot.learning?.records.length ?? 0) === 1, "mission snapshot must expose one learning record");
  assert(snapshot.learning?.records[0]?.status === "blocked", "learning record must begin blocked");
  assert(snapshot.latestCheckpoint?.summary.includes("blocked pending verified capability learning") === true, "learning blocker must create a continuity checkpoint");

  console.log("KINGS CODING MACHINE → CAPABILITY LEARNING INTEGRATION: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
