import type {
  AgentDefinition,
  Mission,
  Task,
  ToolDefinition,
} from "./types";

import {
  WorkforceRegistry,
} from "./registry";

import {
  WorkflowReadinessEvaluator,
} from "./workflow-readiness";

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const tool: ToolDefinition = {
    id: "tool-readiness-test",
    name: "Readiness Test Tool",
    description:
      "Controlled tool used to verify readiness evaluation.",
    capabilities: ["test-tool"],
    enabled: true,
  };

  const agent: AgentDefinition = {
    id: "agent-readiness-test",
    name:
      "K.I.N.G.S. Readiness Test Agent",
    role: "Readiness verification worker",
    description:
      "Controlled agent used to verify task readiness.",
    capabilities: ["test"],
    toolIds: [tool.id],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-readiness-test",
    name:
      "Workflow Readiness Test",
    description:
      "Verify task readiness classification.",
    status: "active",
    objectives: [
      "Verify ready classification.",
      "Verify blocked classification.",
      "Verify invalid classification.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerTool(tool);
  registry.registerAgent(agent);
  registry.registerMission(mission);

  const completedDependency: Task = {
    id: "task-readiness-completed",
    missionId: mission.id,
    name: "Completed dependency",
    description:
      "A completed prerequisite.",
    assignedAgentId: agent.id,
    requiredCapabilities: [],
    requiredToolIds: [],
    status: "completed",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const readyTask: Task = {
    id: "task-readiness-ready",
    missionId: mission.id,
    name: "Ready task",
    description:
      "A task with all requirements satisfied.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "ready",
    dependencyIds: [
      completedDependency.id,
    ],
    inputReferences: [],
    expectedOutputs: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerTask(
    completedDependency,
  );
  registry.registerTask(
    readyTask,
  );

  const evaluator =
    new WorkflowReadinessEvaluator(
      registry,
    );

  const ready =
    evaluator.evaluate(
      readyTask,
    );

  if (
    ready.status !== "ready"
  ) {
    throw new Error(
      `Expected ready task, received "${ready.status}".`,
    );
  }

  console.log(
    "Ready task classification: SUCCESS",
  );

  const pendingDependency: Task = {
    id: "task-readiness-pending",
    missionId: mission.id,
    name: "Pending dependency",
    description:
      "An incomplete prerequisite.",
    assignedAgentId: agent.id,
    requiredCapabilities: [],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const blockedTask: Task = {
    id: "task-readiness-blocked",
    missionId: mission.id,
    name: "Blocked task",
    description:
      "A task waiting on an incomplete dependency.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "ready",
    dependencyIds: [
      pendingDependency.id,
    ],
    inputReferences: [],
    expectedOutputs: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerTask(
    pendingDependency,
  );
  registry.registerTask(
    blockedTask,
  );

  const blocked =
    evaluator.evaluate(
      blockedTask,
    );

  if (
    blocked.status !== "blocked"
  ) {
    throw new Error(
      `Expected blocked task, received "${blocked.status}".`,
    );
  }

  if (
    blocked.reasons.length === 0
  ) {
    throw new Error(
      "Blocked task did not provide a reason.",
    );
  }

  console.log(
    "Blocked task classification: SUCCESS",
  );

  const invalidTask: Task = {
    id: "task-readiness-invalid",
    missionId: mission.id,
    name: "Invalid task",
    description:
      "A task assigned to a nonexistent agent.",
    assignedAgentId:
      "agent-does-not-exist",
    requiredCapabilities: ["test"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerTask(
    invalidTask,
  );

  const invalid =
    evaluator.evaluate(
      invalidTask,
    );

  if (
    invalid.status !== "invalid"
  ) {
    throw new Error(
      `Expected invalid task, received "${invalid.status}".`,
    );
  }

  if (
    invalid.reasons.length === 0
  ) {
    throw new Error(
      "Invalid task did not provide a reason.",
    );
  }

  console.log(
    "Invalid task classification: SUCCESS",
  );

  const noAgentTask: Task = {
    id: "task-readiness-no-agent",
    missionId: mission.id,
    name: "Unassigned task",
    description:
      "A task without an assigned agent.",
    requiredCapabilities: [],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerTask(
    noAgentTask,
  );

  const noAgent =
    evaluator.evaluate(
      noAgentTask,
    );

  if (
    noAgent.status !== "invalid"
  ) {
    throw new Error(
      `Expected unassigned task to be invalid, received "${noAgent.status}".`,
    );
  }

  console.log(
    "Unassigned task validation: SUCCESS",
  );

  console.log(
    "WORKFLOW-002 task readiness evaluation: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "=== WORKFLOW-002 FAILED ===",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
