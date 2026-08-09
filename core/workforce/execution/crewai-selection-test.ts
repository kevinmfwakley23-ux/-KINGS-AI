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
  CrewAIExecutionAdapter,
} from "./crewai-adapter";

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();

  const agent: AgentDefinition = {
    id: "agent-crewai-test",
    name: "K.I.N.G.S. CrewAI Test Agent",
    role: "CrewAI execution worker",
    description:
      "A controlled agent used to verify CrewAI adapter selection.",
    capabilities: ["crewai"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-crewai-selection-test",
    name: "CrewAI Adapter Selection Test",
    description:
      "Verify that K.I.N.G.S. selects the CrewAI adapter for a CrewAI-capable agent.",
    status: "active",
    objectives: [
      "Verify CrewAI capability matching.",
      "Verify CrewAI adapter selection.",
    ],
    sourceReferences: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const task: Task = {
    id: "task-crewai-selection-test",
    missionId: mission.id,
    name: "Select CrewAI adapter",
    description:
      "Verify that the executor selects the CrewAI adapter.",
    assignedAgentId: agent.id,
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "CrewAI adapter selected",
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  registry.registerAgent(agent);
  registry.registerMission(mission);
  registry.registerTask(task);

  const executor = new WorkforceExecutor(
    registry,
    [new CrewAIExecutionAdapter()],
  );

  try {
    await executor.execute(task.id);

    throw new Error(
      "CrewAI adapter unexpectedly executed successfully during selection test.",
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message.includes(
        "CrewAI adapter execution bridge is not implemented yet",
      )
    ) {
      throw error;
    }

    console.log(
      "=== K.I.N.G.S. CREWAI ADAPTER SELECTION ===",
    );
    console.log("Agent capability: crewai");
    console.log("Adapter selected: crewai");
    console.log("Execution bridge: intentionally not connected");
    console.log("Selection test: SUCCESS");
  }
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. CREWAI SELECTION TEST FAILED ===",
  );
  console.error(error);
  throw error;
});
