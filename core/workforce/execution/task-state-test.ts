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
    id: "tool-task-state-test",
    name: "Task State Test Tool",
    description:
      "A fully authorized tool used to isolate task-state enforcement.",
    capabilities: ["test-tool"],
    enabled: true,
  };

  const agent: AgentDefinition = {
    id: "agent-task-state-test",
    name: "K.I.N.G.S. Task State Test Agent",
    role: "Controlled task-state worker",
    description:
      "An authorized agent used to verify task-state enforcement.",
    capabilities: ["test"],
    toolIds: [tool.id],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-task-state-test",
    name: "Task State Authorization Test",
    description:
      "Verify that K.I.N.G.S. rejects execution of a completed task.",
    status: "active",
    objectives: [
      "Verify task-state enforcement.",
      "Verify completed tasks cannot be executed.",
    ],
    sourceReferences: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const task: Task = {
    id: "task-task-state-test",
    missionId: mission.id,
    name: "Attempt completed task execution",
    description:
      "This task is intentionally marked completed to verify that execution is rejected.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "completed",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Execution rejected because task is completed",
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
      "Task state test failed: completed task execution was allowed.",
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message.includes(
        'is not executable because its status is "completed"',
      )
    ) {
      throw new Error(
        `Task state test failed with unexpected error: ${message}`,
      );
    }

    console.log(
      "=== K.I.N.G.S. TASK STATE TEST ===",
    );
    console.log(
      "Completed task execution rejected: SUCCESS",
    );
    console.log(
      `Reason: ${message}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. TASK STATE TEST FAILED ===",
  );
  console.error(error);
});
