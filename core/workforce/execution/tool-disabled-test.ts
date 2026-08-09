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
    id: "tool-disabled-test",
    name: "Disabled Test Tool",
    description:
      "A disabled tool used to verify central tool availability enforcement.",
    capabilities: ["test-tool"],
    enabled: false,
  };

  const agent: AgentDefinition = {
    id: "agent-tool-disabled-test",
    name: "K.I.N.G.S. Disabled Tool Test Agent",
    role: "Controlled disabled-tool worker",
    description:
      "An agent authorized for a tool that has been centrally disabled.",
    capabilities: ["test"],
    toolIds: [tool.id],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-tool-disabled-test",
    name: "Disabled Tool Authorization Test",
    description:
      "Verify that K.I.N.G.S. rejects access to a disabled tool.",
    status: "active",
    objectives: [
      "Verify disabled tool enforcement.",
      "Verify centrally disabled tools cannot execute.",
    ],
    sourceReferences: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const task: Task = {
    id: "task-tool-disabled-test",
    missionId: mission.id,
    name: "Attempt disabled tool access",
    description:
      "This task intentionally requires a tool that is registered and authorized but disabled.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Execution rejected because required tool is disabled",
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
      "Disabled tool test failed: access to a disabled tool was allowed.",
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message.includes(
        "tool-disabled-test (tool disabled)",
      )
    ) {
      throw new Error(
        `Disabled tool test failed with unexpected error: ${message}`,
      );
    }

    console.log(
      "=== K.I.N.G.S. DISABLED TOOL TEST ===",
    );
    console.log(
      "Disabled tool access rejected: SUCCESS",
    );
    console.log(
      `Reason: ${message}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. DISABLED TOOL TEST FAILED ===",
  );
  console.error(error);
});
