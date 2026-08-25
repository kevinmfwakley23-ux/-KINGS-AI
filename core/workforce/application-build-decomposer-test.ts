import { ApplicationBuildDecomposer } from "./application-build-decomposer";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function now(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  const missionId = "mission-authors-forge-build";
  const decomposer = new ApplicationBuildDecomposer();

  const decomposition = decomposer.decompose({
    missionId,
    missionPlan: {
      id: "plan-authors-forge-build",
      missionId,
      version: 1,
      objective: "Build AI Author's Forge as a standalone product.",
      milestones: [],
      decisionIds: [],
      acceptanceCriteria: ["application builds", "application tests", "production-ready release"],
      locked: true,
      approvedByHuman: true,
      createdAt: now(),
      updatedAt: now(),
    },
    objective: "Build AI Author's Forge as a standalone product.",
    requirements: [
      "AI-assisted book writing",
      "editing and continuity",
      "persistent project memory",
      "KDP-ready covers and publishing support",
      "market research and promotion tools",
    ],
    acceptanceCriteria: [
      "standalone application",
      "verified build",
      "verified test suite",
    ],
  });

  assert(decomposition.tasks.length === 8, "application decomposition should produce eight core build tasks");
  assert(decomposition.lanes.includes("architecture"), "architecture lane required");
  assert(decomposition.lanes.includes("quality"), "quality lane required");
  assert(decomposition.lanes.includes("release"), "release lane required");

  const byId = new Map(decomposition.tasks.map((task) => [task.id, task]));
  const architecture = byId.get(decomposition.rootTaskId);
  const research = byId.get(`task-${missionId}-research`);
  const backend = byId.get(`task-${missionId}-backend`);
  const frontend = byId.get(`task-${missionId}-frontend`);
  const memory = byId.get(`task-${missionId}-memory`);
  const integration = byId.get(`task-${missionId}-integration`);
  const quality = byId.get(`task-${missionId}-quality`);
  const release = byId.get(`task-${missionId}-release`);

  assert(architecture?.status === "ready", "architecture should be the root runnable task");
  assert(research?.dependencyIds.includes(decomposition.rootTaskId) === true, "research must depend on architecture");
  assert(backend?.dependencyIds.includes(research!.id) === true, "backend must depend on research");
  assert(frontend?.dependencyIds.includes(research!.id) === true, "frontend must depend on research");
  assert(memory?.dependencyIds.includes(backend!.id) === true, "memory must depend on backend");
  assert(memory?.dependencyIds.includes(frontend!.id) === true, "memory must depend on frontend");
  assert(integration?.dependencyIds.includes(memory!.id) === true, "integration must depend on memory");
  assert(quality?.dependencyIds.includes(integration!.id) === true, "quality must depend on integration");
  assert(release?.dependencyIds.includes(quality!.id) === true, "release must depend on quality");
  assert(decomposition.tasks.every((task) => task.requiredToolIds.includes("tool-execution-sandbox")), "all application tasks must be governed by the execution sandbox");

  console.log("APPLICATION BUILD DECOMPOSER: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
