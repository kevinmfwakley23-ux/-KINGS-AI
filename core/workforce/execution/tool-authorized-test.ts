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
    id: "tool-authorized-test",
    name: "Authorized Test Tool",
    description:
      "A registered and enabled tool used to verify successful authorized execution.",
    capabilities: ["test-tool"],
    enabled: true,
  };

  const agent: AgentDefinition = {
    id: "agent-tool-authorized-test",
    name: "K.I.N.G.S. Authorized Tool Test Agent",
    role: "Controlled authorized-tool worker",
    description:
      "An agent explicitly authorized to use the registered test tool.",
    capabilities: ["test"],
    toolIds: [tool.id],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-tool-authorized-test",
    name: "Authorized Tool Execution Test",
    description:
      "Verify that K.I.N.G.S. permits execution when tool authorization requirements are satisfied.",
    status: "active",
    objectives: [
      "Verify registered tool acceptance.",
      "Verify agent tool authorization.",
      "Verify enabled tool acceptance.",
      "Verify execution proceeds after authorization.",
    ],
    sourceReferences: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const task: Task = {
    id: "task-tool-authorized-test",
    missionId: mission.id,
    name: "Execute authorized tool task",
    description:
      "Execute a task requiring a registered, enabled tool that the assigned agent is authorized to use.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Successful WorkforceResult",
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

  const result = await executor.execute(task.id);

  if (result.status !== "success") {
    throw new Error(
      `Authorized tool test failed: unexpected result status "${result.status}".`,
    );
  }

  console.log(
    "=== K.I.N.G.S. AUTHORIZED TOOL TEST ===",
  );
  console.log(
    "Registered + authorized + enabled tool execution: SUCCESS",
  );
  console.log(
    JSON.stringify(result, null, 2),
  );
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. AUTHORIZED TOOL TEST FAILED ===",
  );
  console.error(error);
});
