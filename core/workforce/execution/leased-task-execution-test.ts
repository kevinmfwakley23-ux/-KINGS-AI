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
  TaskControl,
} from "../task-control";

import {
  TaskLeaseManager,
} from "../task-lease";

import {
  WorkforceExecutor,
} from "./executor";

import {
  TestExecutionAdapter,
} from "./test-adapter";

import {
  TaskExecutionController,
} from "./task-execution";

import {
  LeasedTaskExecutionController,
} from "./leased-task-execution";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const tool: ToolDefinition = {
    id: "tool-control-005",
    name: "CONTROL-005 Test Tool",
    description:
      "Tool used to verify workflow lease authority.",
    capabilities: ["test-tool"],
    enabled: true,
  };

  const agent: AgentDefinition = {
    id: "agent-control-005",
    name: "CONTROL-005 Test Agent",
    role: "Lease-controlled workflow worker",
    description:
      "Agent used to verify lease-bound workflow execution.",
    capabilities: ["test"],
    toolIds: [tool.id],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-control-005",
    name: "Workflow Lease Authority Test",
    description:
      "Verify that execution acquires and releases task authority.",
    status: "active",
    objectives: [
      "Acquire task lease before execution.",
      "Execute through task lifecycle authority.",
      "Release the lease after execution.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const task: Task = {
    id: "task-control-005",
    missionId: mission.id,
    name: "Workflow Lease Authority Test",
    description:
      "Verify controlled lease acquisition and release.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "lease-controlled execution",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerTool(tool);
  registry.registerAgent(agent);
  registry.registerMission(mission);
  registry.registerTask(task);

  const taskControl =
    new TaskControl(
      registry,
    );

  const leaseManager =
    new TaskLeaseManager(
      registry,
    );

  const workforceExecutor =
    new WorkforceExecutor(
      registry,
      [new TestExecutionAdapter()],
    );

  const taskExecutionController =
    new TaskExecutionController(
      registry,
      taskControl,
      workforceExecutor,
    );

  const leasedTaskExecutionController =
    new LeasedTaskExecutionController(
      leaseManager,
      taskExecutionController,
    );

  const result =
    await leasedTaskExecutionController.execute(
      task.id,
      "workflow-owner-001",
      60_000,
    );

  assert(
    result.status === "success",
    "Controlled workflow execution should succeed.",
  );

  assert(
    task.status === "completed",
    "Successful execution should complete the task.",
  );

  assert(
    leaseManager.get(task.id) === undefined,
    "Execution lease should be released after completion.",
  );

  let secondExecutionRejected =
    false;

  try {
    await leasedTaskExecutionController.execute(
      task.id,
      "workflow-owner-001",
      60_000,
    );
  } catch {
    secondExecutionRejected =
      true;
  }

  assert(
    secondExecutionRejected,
    "A completed task must not be executed again.",
  );

  console.log(
    "Lease acquired for execution: SUCCESS",
  );

  console.log(
    "Task execution lifecycle completed: SUCCESS",
  );

  console.log(
    "Lease released after execution: SUCCESS",
  );

  console.log(
    "Completed task re-execution rejected: SUCCESS",
  );

  console.log(
    "CONTROL-005 workflow lease execution authority: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "CONTROL-005 workflow lease execution authority: FAILED",
    );
    console.error(error);
    throw error;
  },
);
