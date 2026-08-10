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
  const registry =
    new WorkforceRegistry();

  const agent: AgentDefinition = {
    id: "agent-crewai-selection-test",
    name:
      "K.I.N.G.S. CrewAI Test Agent",
    role:
      "CrewAI execution worker",
    description:
      "A controlled agent used to verify CrewAI adapter selection and execution.",
    capabilities: ["crewai"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id:
      "mission-crewai-selection-test",
    name:
      "CrewAI Adapter Integration Test",
    description:
      "Verify that K.I.N.G.S. selects and invokes the CrewAI adapter.",
    status: "active",
    objectives: [
      "Verify CrewAI capability matching.",
      "Verify CrewAI adapter selection.",
      "Verify the CrewAI bridge round trip.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const task: Task = {
    id:
      "task-crewai-selection-test",
    missionId: mission.id,
    name:
      "Execute CrewAI adapter",
    description:
      "Verify that the executor selects the CrewAI adapter and receives a standardized result.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["crewai"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "CrewAI adapter selected",
      "CrewAI bridge executed",
      "Standardized workforce result returned",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerAgent(
    agent,
  );

  registry.registerMission(
    mission,
  );

  registry.registerTask(
    task,
  );

  const executor =
    new WorkforceExecutor(
      registry,
      [
        new CrewAIExecutionAdapter(),
      ],
    );

  const result =
    await executor.execute(
      task.id,
    );

  if (
    result.status !== "success"
  ) {
    throw new Error(
      `Expected successful CrewAI execution, received "${result.status}".`,
    );
  }

  if (
    result.taskId !== task.id
  ) {
    throw new Error(
      "CrewAI result task ID mismatch.",
    );
  }

  if (
    result.agentId !== agent.id
  ) {
    throw new Error(
      "CrewAI result agent ID mismatch.",
    );
  }

  if (
    result.verificationReferences
      .length !== 3
  ) {
    throw new Error(
      "CrewAI verification references mismatch.",
    );
  }

  console.log(
    "=== K.I.N.G.S. CREWAI ADAPTER INTEGRATION ===",
  );

  console.log(
    "Agent capability: crewai",
  );

  console.log(
    "Adapter selected: crewai",
  );

  console.log(
    "CrewAI bridge round trip: SUCCESS",
  );

  console.log(
    "Standardized WorkforceResult: SUCCESS",
  );

  console.log(
    "WORKFORCE-006 CrewAI adapter integration: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "=== K.I.N.G.S. CREWAI ADAPTER INTEGRATION FAILED ===",
    );
    console.error(error);
    throw error;
  },
);
