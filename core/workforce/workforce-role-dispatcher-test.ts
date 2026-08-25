import { WorkforceRegistry } from "./registry";
import type { AgentDefinition, Task } from "./types";
import { WorkforceOrchestrator } from "./workforce-orchestrator";
import { WorkforceRoleDispatcher } from "./workforce-role-dispatcher";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function makeTask(id: string, missionId: string, capabilities: string[], tools: string[]): Task {
  const now = new Date().toISOString();
  return {
    id,
    missionId,
    name: id,
    description: id,
    requiredCapabilities: capabilities,
    requiredToolIds: tools,
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: ["verified result"],
    createdAt: now,
    updatedAt: now,
  };
}

function makeAgent(id: string, role: string, capabilities: string[], tools: string[]): AgentDefinition {
  return {
    id,
    name: id,
    role,
    description: role,
    capabilities,
    toolIds: tools,
    status: "available",
  };
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const orchestrator = new WorkforceOrchestrator(registry);
  const dispatcher = new WorkforceRoleDispatcher(registry, orchestrator);
  const missionId = "mission-role-dispatch-test";

  registry.registerAgent(makeAgent("agent-reviewer", "reviewer", ["review"], ["tool-review"]));
  registry.registerAgent(makeAgent("agent-coder", "coder", ["coding", "debugging"], ["tool-execution-sandbox"]));
  registry.registerTask(makeTask("task-code", missionId, ["coding"], ["tool-execution-sandbox"]));

  const assigned = dispatcher.dispatchNext(missionId);
  assert(assigned?.dispatch.status === "dispatched", "eligible task should dispatch");
  assert(assigned?.assignment?.agentId === "agent-coder", "coding task should be assigned to coder");
  assert(assigned?.assignment?.role === "coder", "assignment should preserve worker role");

  const blockedRegistry = new WorkforceRegistry();
  const blockedOrchestrator = new WorkforceOrchestrator(blockedRegistry);
  const blockedDispatcher = new WorkforceRoleDispatcher(blockedRegistry, blockedOrchestrator);
  blockedRegistry.registerAgent(makeAgent("agent-reviewer", "reviewer", ["review"], ["tool-review"]));
  blockedRegistry.registerTask(makeTask("task-code", missionId, ["coding"], ["tool-execution-sandbox"]));

  const blocked = blockedDispatcher.dispatchNext(missionId);
  assert(blocked?.dispatch.status === "blocked", "task without an eligible worker should block");

  console.log("WORKFORCE ROLE DISPATCHER: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
