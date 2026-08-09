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
    id: "agent-authorization-test",
    name: "K.I.N.G.S. Authorization Test Agent",
    role: "Controlled test worker",
    description:
      "An agent intentionally missing the capability required by the test task.",
    capabilities: ["test"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-authorization-test",
    name: "Workforce Authorization Test",
    description:
      "Verify that K.I.N.G.S. rejects unauthorized task execution.",
    status: "active",
    objectives: [
      "Verify capability enforcement.",
      "Verify unauthorized execution is rejected.",
    ],
    sourceReferences: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const task: Task = {
    id: "task-authorization-test",
    missionId: mission.id,
    name: "Attempt unauthorized execution",
    description:
      "This task intentionally requires a capability the assigned agent does not possess.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["deploy"],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Execution rejected",
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

  try {
    await executor.execute(task.id);

    throw new Error(
      "Authorization test failed: unauthorized execution was allowed.",
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message.includes(
        'lacks required capabilities: deploy',
      )
    ) {
      throw new Error(
        `Authorization test failed with unexpected error: ${message}`,
      );
    }

    console.log(
      "=== K.I.N.G.S. AUTHORIZATION TEST ===",
    );
    console.log(
      "Unauthorized execution rejected: SUCCESS",
    );
    console.log(
      `Reason: ${message}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. AUTHORIZATION TEST FAILED ===",
  );
  console.error(error);
});
