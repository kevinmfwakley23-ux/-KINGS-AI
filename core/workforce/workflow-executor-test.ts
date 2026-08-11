import type {
  AgentDefinition,
  Mission,
  Task,
  ToolDefinition,
  Workflow,
} from "./types";

import {
  WorkforceRegistry,
} from "./registry";

import {
  WorkforceExecutor,
} from "./execution/executor";

import {
  TestExecutionAdapter,
} from "./execution/test-adapter";

import {
  WorkflowExecutor,
} from "./workflow-executor";

import {
  WorkUnitRegistry,
} from "./work-unit-registry";

import {
  registerTestWorkUnit,
} from "./execution/test-work-unit";

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
    id: "tool-workflow-004",
    name: "Workflow Test Tool",
    description:
      "Tool used to verify workflow execution.",
    capabilities: ["test-tool"],
    enabled: true,
  };

  const agent: AgentDefinition = {
    id: "agent-workflow-004",
    name: "Workflow Test Agent",
    role: "Workflow execution worker",
    description:
      "Agent used to verify workflow progression.",
    capabilities: ["test"],
    toolIds: [tool.id],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-workflow-004",
    name: "Workflow Progression Test",
    description:
      "Verify dependency-aware workflow execution.",
    status: "active",
    objectives: [
      "Execute tasks in dependency order.",
      "Persist completed task state.",
      "Verify downstream tasks become executable.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const now =
    new Date().toISOString();

  const taskA: Task = {
    id: "task-workflow-004-a",
    missionId: mission.id,
    name: "Task A",
    description:
      "First task in the workflow chain.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Task A completed",
    ],
    createdAt: now,
    updatedAt: now,
  };

  const taskB: Task = {
    id: "task-workflow-004-b",
    missionId: mission.id,
    name: "Task B",
    description:
      "Second task depends on Task A.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "pending",
    dependencyIds: [
      taskA.id,
    ],
    inputReferences: [],
    expectedOutputs: [
      "Task B completed",
    ],
    createdAt: now,
    updatedAt: now,
  };

  const taskC: Task = {
    id: "task-workflow-004-c",
    missionId: mission.id,
    name: "Task C",
    description:
      "Third task depends on Task B.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "pending",
    dependencyIds: [
      taskB.id,
    ],
    inputReferences: [],
    expectedOutputs: [
      "Task C completed",
    ],
    createdAt: now,
    updatedAt: now,
  };

  const workflow: Workflow = {
    id: "workflow-004",
    missionId: mission.id,
    name: "Workflow Progression Test",
    description:
      "Verify a three-task dependency chain.",
    taskIds: [
      taskA.id,
      taskB.id,
      taskC.id,
    ],
    requiresApproval: false,
  };

  registry.registerTool(
    tool,
  );

  registry.registerAgent(
    agent,
  );

  registry.registerMission(
    mission,
  );

  registry.registerTask(
    taskA,
  );

  registry.registerTask(
    taskB,
  );

  registry.registerTask(
    taskC,
  );

  registry.registerWorkflow(
    workflow,
  );

  const workUnitRegistry =
    new WorkUnitRegistry();

  registerTestWorkUnit(
    workUnitRegistry,
    taskA.id,
  );

  registerTestWorkUnit(
    workUnitRegistry,
    taskB.id,
  );

  registerTestWorkUnit(
    workUnitRegistry,
    taskC.id,
  );

  const workforceExecutor =
    new WorkforceExecutor(
      registry,
      [
        new TestExecutionAdapter(),
      ],
      undefined,
      workUnitRegistry,
    );

  const workflowExecutor =
    new WorkflowExecutor(
      registry,
      workforceExecutor,
    );

  assert(
    taskA.status === "ready",
    "Task A should initially be ready.",
  );

  assert(
    taskB.status === "pending",
    "Task B should initially be pending.",
  );

  assert(
    taskC.status === "pending",
    "Task C should initially be pending.",
  );

  console.log(
    "Initial workflow state: READY CHAIN",
  );

  const result =
    await workflowExecutor.execute(
      workflow.id,
      "workflow-test-owner",
      60_000,
    );

  const taskAResult =
    result.evaluations.find(
      (evaluation) =>
        evaluation.taskId === taskA.id,
    );

  const taskBResult =
    result.evaluations.find(
      (evaluation) =>
        evaluation.taskId === taskB.id,
    );

  const taskCResult =
    result.evaluations.find(
      (evaluation) =>
        evaluation.taskId === taskC.id,
    );

  assert(
    taskAResult?.status === "completed",
    "Task A should complete successfully.",
  );

  assert(
    taskBResult?.status === "completed",
    "Task B should complete successfully after Task A.",
  );

  assert(
    taskCResult?.status === "completed",
    "Task C should complete successfully after Task B.",
  );

  assert(
    taskA.status === "completed",
    "Task A state should persist as completed.",
  );

  assert(
    taskB.status === "completed",
    "Task B state should persist as completed.",
  );

  assert(
    taskC.status === "completed",
    "Task C state should persist as completed.",
  );

  console.log(
    "Task A execution: SUCCESS",
  );

  console.log(
    "Task B dependency progression: SUCCESS",
  );

  console.log(
    "Task C dependency progression: SUCCESS",
  );

  console.log(
    "Workflow state persistence: SUCCESS",
  );

  console.log(
    "WORKFLOW-004 workflow progression: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "=== WORKFLOW-004 FAILED ===",
    );
    console.error(error);
    throw error;
  },
);
