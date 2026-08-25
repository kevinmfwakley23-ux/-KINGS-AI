import { WorkforceRegistry } from "./registry";
import { ProductBuildMissionAssembler } from "./product-build-mission-assembler";
import type { Mission } from "./types";
import type { MissionPlan } from "./mission-continuity";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function now(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const assembler = new ProductBuildMissionAssembler(registry);

  const mission: Mission = {
    id: "mission-forge-build",
    name: "AI Author's Forge",
    description: "Build the standalone AI Author's Forge application.",
    status: "planned",
    objectives: ["Build the full AI Author's Forge product."],
    sourceReferences: ["owner-vision"],
    createdAt: now(),
    updatedAt: now(),
  };

  const plan: MissionPlan = {
    id: "plan-forge-build",
    missionId: mission.id,
    version: 1,
    objective: "Build AI Author's Forge.",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: ["The decomposed application build is registered as governed workforce work."],
    locked: true,
    approvedByHuman: true,
    createdAt: now(),
    updatedAt: now(),
  };

  const result = assembler.assemble({
    mission,
    plan,
    ownerVision: "Build a standalone AI-assisted book writing, editing, market research, KDP production, cover-generation, and promotion application.",
  });

  assert(result.tasks.length >= 8, "product build should create a multi-stage task graph");
  assert(result.registeredTaskIds.length === result.tasks.length, "all decomposed tasks should be registered");
  assert(result.tasks.some((task) => task.name.toLowerCase().includes("architecture")), "architecture task should exist");
  assert(result.tasks.some((task) => task.name.toLowerCase().includes("frontend")), "frontend task should exist");
  assert(result.tasks.some((task) => task.name.toLowerCase().includes("backend")), "backend task should exist");
  assert(result.tasks.some((task) => task.name.toLowerCase().includes("release")), "release task should exist");

  const release = result.tasks.find((task) => task.name.toLowerCase().includes("release"));
  assert(Boolean(release && release.dependencyIds.length > 0), "release must depend on earlier build work");

  console.log("PRODUCT BUILD MISSION ASSEMBLER: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
