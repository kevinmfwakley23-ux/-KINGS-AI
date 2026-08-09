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
    id: "agent-tool-authorization-test",
    name: "K.I.N.G.S. Tool Authorization Test Agent",
    role: "Controlled tool test worker",
    description:
      "An agent used to verify that K.I.N.G.S. rejects access to unregistered tools.",
    capabilities: ["test"],
    toolIds: ["tool-missing"],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-tool-authorization-test",
    name: "Workforce Tool Authorization Test",
    description:
      "Verify that K.I.N.G.S. rejects access to an unregistered tool.",
    status: "active",
    objectives: [
      "Verify tool existence enforcement.",
      "Verify unauthorized tool access is rejected.",
    ],
    sourceReferences: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const task: Task = {
    id: "task-tool-authorization-test",
    missionId: mission.id,
    name: "Attempt missing tool access",
    description:
      "This task intentionally requires a tool that is not registered.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: ["tool-missing"],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Execution rejected because required tool is not registered",
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
      "Tool authorization test failed: access to an unregistered tool was allowed.",
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message.includes(
        "tool-missing (not registered)",
      )
    ) {
      throw new Error(
        `Tool authorization test failed with unexpected error: ${message}`,
      );
    }

    console.log(
      "=== K.I.N.G.S. TOOL AUTHORIZATION TEST ===",
    );
    console.log(
      "Unregistered tool access rejected: SUCCESS",
    );
    console.log(
      `Reason: ${message}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. TOOL AUTHORIZATION TEST FAILED ===",
  );
  console.error(error);
});
