import type {
  AgentDefinition,
  Mission,
  Task,
  ToolDefinition,
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

  const tool: ToolDefinition = {
    id: "tool-registered-test",
    name: "Registered Test Tool",
    description:
      "A registered tool used to verify agent-specific tool authorization.",
    capabilities: ["test-tool"],
    enabled: true,
  };

  const agent: AgentDefinition = {
    id: "agent-tool-agent-authorization-test",
    name: "K.I.N.G.S. Agent Tool Authorization Test Agent",
    role: "Controlled tool authorization worker",
    description:
      "An agent intentionally not authorized for the registered test tool.",
    capabilities: ["test"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-tool-agent-authorization-test",
    name: "Agent Tool Authorization Test",
    description:
      "Verify that K.I.N.G.S. rejects a registered tool the agent is not authorized to use.",
    status: "active",
    objectives: [
      "Verify agent-specific tool authorization.",
      "Verify unauthorized tool access is rejected.",
    ],
    sourceReferences: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const task: Task = {
    id: "task-tool-agent-authorization-test",
    missionId: mission.id,
    name: "Attempt unauthorized registered tool access",
    description:
      "This task intentionally requires a registered tool that the assigned agent does not possess.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Execution rejected because agent is not authorized for required tool",
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  registry.registerTool(tool);
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
      "Agent tool authorization test failed: unauthorized registered tool access was allowed.",
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message.includes(
        "tool-registered-test (agent not authorized)",
      )
    ) {
      throw new Error(
        `Agent tool authorization test failed with unexpected error: ${message}`,
      );
    }

    console.log(
      "=== K.I.N.G.S. AGENT TOOL AUTHORIZATION TEST ===",
    );
    console.log(
      "Registered tool without agent authorization rejected: SUCCESS",
    );
    console.log(
      `Reason: ${message}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. AGENT TOOL AUTHORIZATION TEST FAILED ===",
  );
  console.error(error);
});
