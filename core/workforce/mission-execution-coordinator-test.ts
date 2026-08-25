import { WorkforceRegistry } from "./registry";
import { WorkforceOrchestrator } from "./workforce-orchestrator";
import { WorkforceRoleDispatcher } from "./workforce-role-dispatcher";
import { WorkforceResultHandoff } from "./workforce-result-handoff";
import { MissionExecutionCoordinator } from "./mission-execution-coordinator";
import type { Mission, Task, AgentDefinition, WorkforceResult } from "./types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function now(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const orchestrator = new WorkforceOrchestrator(registry);
  const dispatcher = new WorkforceRoleDispatcher(registry, orchestrator);
  const handoff = new WorkforceResultHandoff(registry, orchestrator);
  const coordinator = new MissionExecutionCoordinator({ registry, orchestrator, dispatcher, handoff });

  const mission: Mission = {
    id: "mission-coordinator-test",
    name: "Coordinator proof",
    description: "Prove end-to-end workforce coordination.",
    status: "planned",
    objectives: ["dispatch and hand off work"],
    sourceReferences: ["test"],
    createdAt: now(),
    updatedAt: now(),
  };
  registry.registerMission(mission);

  const agent: AgentDefinition = {
    id: "agent-architect-1",
    name: "Architect 1",
    role: "architect",
    description: "Architecture worker",
    capabilities: ["architecture", "planning"],
    toolIds: [],
    status: "available",
  };
  registry.registerAgent(agent);

  const taskA: Task = {
    id: "task-architecture",
    missionId: mission.id,
    name: "Architecture",
    description: "Design the application architecture.",
    requiredCapabilities: ["architecture"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: ["architecture artifact"],
    createdAt: now(),
    updatedAt: now(),
  };
  const taskB: Task = {
    id: "task-followup",
    missionId: mission.id,
    name: "Follow-up",
    description: "Consume the architecture result.",
    requiredCapabilities: ["architecture"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [taskA.id],
    inputReferences: [],
    expectedOutputs: ["follow-up artifact"],
    createdAt: now(),
    updatedAt: now(),
  };
  registry.registerTask(taskA);
  registry.registerTask(taskB);

  const first = coordinator.dispatchNext(mission.id);
  assert(first?.taskId === taskA.id, "coordinator should dispatch the runnable architecture task");
  assert(first?.agentId === agent.id, "coordinator should use the qualified architect");

  const result: WorkforceResult = {
    id: "result-architecture",
    taskId: taskA.id,
    agentId: agent.id,
    status: "success",
    summary: "Architecture completed.",
    artifactIds: ["artifact-architecture"],
    verificationReferences: ["verification-architecture"],
    createdAt: now(),
  };

  const handoffResult = coordinator.acceptVerifiedResult(result);
  assert(handoffResult.status === "accepted", "verified result should be accepted");
  assert(handoffResult.unlockedTaskIds.includes(taskB.id), "dependent task should unlock after successful handoff");

  const second = coordinator.dispatchNext(mission.id);
  assert(second?.taskId === taskB.id, "coordinator should dispatch the unlocked dependent task");

  console.log("MISSION EXECUTION COORDINATOR: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
