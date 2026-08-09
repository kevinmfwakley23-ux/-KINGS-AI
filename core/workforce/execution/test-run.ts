import type {
  AgentDefinition,
  Mission,
  Task,
} from "../types";

import {
  WorkforceRegistry,
} from "../registry";

import {
  WorkforceExecutor,
} from "./executor";

import {
  TestExecutionAdapter,
} from "./test-adapter";

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();

  const agent: AgentDefinition = {
    id: "agent-test-engineer",
    name: "K.I.N.G.S. Test Engineer",
    role: "Software verification worker",
    description:
      "A controlled agent used to verify the K.I.N.G.S. execution pipeline.",
    capabilities: ["test"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-workforce-test",
    name: "Workforce Execution Test",
    description:
      "Verify that K.I.N.G.S. can assign and execute a task.",
    status: "active",
    objectives: [
      "Verify task assignment.",
      "Verify adapter selection.",
      "Verify result generation.",
    ],
    sourceReferences: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const task: Task = {
    id: "task-execution-test",
    missionId: mission.id,
    name: "Execute workforce test",
    description:
      "Verify the K.I.N.G.S. executor can route a task to an execution adapter.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Successful WorkforceResult",
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  registry.registerAgent(agent);
  registry.registerMission(mission);
  registry.registerTask(task);

  const executor = new WorkforceExecutor(
    registry,
    [new TestExecutionAdapter()],
  );

  const result = await executor.execute(task.id);

  console.log("=== K.I.N.G.S. EXECUTION RESULT ===");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error("=== K.I.N.G.S. EXECUTION TEST FAILED ===");
  console.error(error);
});
