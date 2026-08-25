import { WorkforceRegistry } from "./registry";
import { ProductBuildExecutionBridge } from "./product-build-execution-bridge";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function now(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const missionId = "mission-authors-forge-product-build";
  const bridge = new ProductBuildExecutionBridge(registry);

  registry.registerAgent({
    id: "agent-architect",
    name: "Architect",
    role: "architect",
    description: "Build architecture and planning specialist.",
    capabilities: ["architecture", "research", "coding", "testing"],
    toolIds: ["repo"],
    status: "available",
  });

  const result = bridge.start({
    mission: {
      id: missionId,
      name: "AI Author's Forge",
      description: "Build the complete Author's Forge application.",
      status: "planned",
      objectives: ["Build the complete Author's Forge application."],
      sourceReferences: ["owner-vision"],
      createdAt: now(),
      updatedAt: now(),
    },
    plan: {
      id: "plan-authors-forge",
      missionId,
      version: 1,
      objective: "Build the complete Author's Forge application.",
      milestones: [],
      decisionIds: [],
      acceptanceCriteria: ["product build graph assembled and first qualified task dispatched"],
      locked: true,
      approvedByHuman: true,
      createdAt: now(),
      updatedAt: now(),
    },
    ownerVision: "Build Author's Forge as a full AI-assisted authoring, editing, publishing, cover, research and marketing application.",
  });

  assert(result.assembly.tasks.length >= 5, "product assembly should create a multi-task application graph");
  assert(result.assembly.registeredTaskIds.length === result.assembly.tasks.length, "all assembled tasks should register");
  assert(result.snapshot.runnableTaskIds.length > 0, "assembled mission should expose runnable work");
  assert(result.firstDispatch !== undefined, "first qualified task should dispatch");
  assert(result.firstDispatch?.taskId !== undefined, "dispatch must identify a task");
  assert(result.firstDispatch?.agentId === "agent-architect", "architect should receive the first architecture-capable task");

  console.log("PRODUCT BUILD → MISSION EXECUTION BRIDGE: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
