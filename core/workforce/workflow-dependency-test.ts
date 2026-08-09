import type {
  AgentDefinition,
  Mission,
  Task,
} from "./types";

import {
  WorkforceRegistry,
} from "./registry";

import {
  WorkflowDependencyEvaluator,
} from "./workflow-dependency";

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const agent: AgentDefinition = {
    id: "agent-workflow-dependency-test",
    name:
      "K.I.N.G.S. Workflow Dependency Test Agent",
    role: "Workflow verification worker",
    description:
      "Controlled agent used to verify dependency evaluation.",
    capabilities: ["test"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-workflow-dependency-test",
    name:
      "Workflow Dependency Test",
    description:
      "Verify that K.I.N.G.S. evaluates task dependencies correctly.",
    status: "active",
    objectives: [
      "Detect incomplete dependencies.",
      "Allow tasks whose dependencies are complete.",
      "Detect missing dependency records.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const completedTask: Task = {
    id: "task-dependency-completed",
    missionId: mission.id,
    name: "Completed dependency",
    description:
      "A dependency that has already completed.",
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

  const pendingTask: Task = {
    id: "task-dependency-pending",
    missionId: mission.id,
    name: "Pending dependency",
    description:
      "A dependency that has not completed.",
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

  const dependentTask: Task = {
    id: "task-dependent",
    missionId: mission.id,
    name: "Dependent task",
    description:
      "A task that requires other tasks to complete first.",
    assignedAgentId: agent.id,
    requiredCapabilities: [],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [
      completedTask.id,
      pendingTask.id,
    ],
    inputReferences: [],
    expectedOutputs: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerAgent(agent);
  registry.registerMission(mission);
  registry.registerTask(
    completedTask,
  );
  registry.registerTask(
    pendingTask,
  );
  registry.registerTask(
    dependentTask,
  );

  const evaluator =
    new WorkflowDependencyEvaluator(
      registry,
    );

  const blocked =
    evaluator.evaluate(
      dependentTask,
    );

  if (
    blocked.satisfied
  ) {
    throw new Error(
      "Dependency test failed: incomplete dependency was treated as satisfied.",
    );
  }

  if (
    blocked.missingDependencyIds.length !==
    1
  ) {
    throw new Error(
      "Dependency test failed: expected exactly one incomplete dependency.",
    );
  }

  if (
    blocked.missingDependencyIds[0] !==
    pendingTask.id
  ) {
    throw new Error(
      "Dependency test failed: incorrect incomplete dependency was reported.",
    );
  }

  console.log(
    "Incomplete dependency detection: SUCCESS",
  );

  pendingTask.status =
    "completed";

  const satisfied =
    evaluator.evaluate(
      dependentTask,
    );

  if (
    !satisfied.satisfied
  ) {
    throw new Error(
      "Dependency test failed: completed dependencies were not accepted.",
    );
  }

  if (
    satisfied.missingDependencyIds.length !==
    0
  ) {
    throw new Error(
      "Dependency test failed: completed dependencies were incorrectly reported as missing.",
    );
  }

  console.log(
    "Completed dependency acceptance: SUCCESS",
  );

  const missingDependencyTask: Task = {
    id: "task-missing-dependency",
    missionId: mission.id,
    name:
      "Missing dependency task",
    description:
      "A task referencing a dependency that does not exist.",
    assignedAgentId: agent.id,
    requiredCapabilities: [],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [
      "task-does-not-exist",
    ],
    inputReferences: [],
    expectedOutputs: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerTask(
    missingDependencyTask,
  );

  const missing =
    evaluator.evaluate(
      missingDependencyTask,
    );

  if (
    missing.satisfied
  ) {
    throw new Error(
      "Dependency test failed: missing dependency was treated as satisfied.",
    );
  }

  if (
    missing.missingDependencyIds[0] !==
    "task-does-not-exist"
  ) {
    throw new Error(
      "Dependency test failed: missing dependency ID was not preserved.",
    );
  }

  console.log(
    "Missing dependency detection: SUCCESS",
  );

  console.log(
    "WORKFLOW-001 dependency evaluation: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "=== WORKFLOW-001 FAILED ===",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
