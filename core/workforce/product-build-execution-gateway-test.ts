import { WorkforceRegistry } from "./registry";
import { ProductBuildExecutionGateway } from "./product-build-execution-gateway";
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
  const mission: Mission = {
    id: "mission-authors-forge-build",
    name: "AI Author's Forge",
    description: "Build an autonomous AI-assisted book writing, editing, publishing, cover, research, and promotion application.",
    status: "planned",
    objectives: [
      "Build Author's Forge as a standalone end-user product.",
    ],
    sourceReferences: ["owner-vision"],
    createdAt: now(),
    updatedAt: now(),
  };

  const plan: MissionPlan = {
    id: "plan-authors-forge-build",
    missionId: mission.id,
    version: 1,
    objective: "Build Author's Forge end-to-end.",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: [
      "application build program assembled",
      "first qualified workforce task dispatched",
    ],
    locked: true,
    approvedByHuman: true,
    createdAt: now(),
    updatedAt: now(),
  };

  registry.registerAgent({
    id: "agent-architect",
    name: "Architect",
    role: "product-architect",
    description: "Defines application architecture and build plan.",
    capabilities: ["architecture", "planning", "reasoning"],
    toolIds: ["tool-execution-sandbox"],
    status: "available",
  });

  const gateway = new ProductBuildExecutionGateway(registry);
  const result = gateway.start({
    mission,
    plan,
    ownerVision: "Build Author's Forge as a standalone AI book creation and publishing product with writing, editing, market research, KDP covers, publishing, and promotion capabilities.",
  });

  assert(result.assembly.registeredTaskIds.length >= 8, "product build must assemble the full multi-domain task graph");
  assert(result.execution.runnableTaskIds.length > 0, "assembled mission must expose runnable work");
  assert(result.nextDispatch?.taskId !== undefined, "gateway must dispatch the first qualified task");
  assert(result.nextDispatch?.role === "product-architect", "first dispatch should be assigned to the architect role");
  assert(result.nextDispatch?.executor === "kings-internal", "dispatch must remain K.I.N.G.S.-owned");

  const second = gateway.snapshot(mission.id);
  assert(second.execution.runningTaskIds.includes(result.nextDispatch!.taskId), "first dispatched task must remain running until a verified result is handed back");

  console.log("PRODUCT BUILD EXECUTION GATEWAY: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
