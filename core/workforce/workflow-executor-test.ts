import type {
  AgentDefinition,
  Mission,
  Task,
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

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const agent: AgentDefinition = {
    id: "agent-workflow-progression-test",
    name:
      "K.I.N.G.S. Workflow Progression Test Agent",
    role: "Workflow progression worker",
    description:
      "Controlled agent used to verify workflow progression.",
    capabilities: ["test"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-workflow-progression-test",
    name:
      "Workflow Progression Test",
    description:
      "Verify progressive workflow execution.",
    status: "active",
    objectives: [
      "Execute ready tasks.",
      "Complete successful tasks.",
      "Unlock dependent tasks.",
      "Continue until the workflow is complete.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const taskA: Task = {
    id: "task-workflow-progression-a",
    missionId: mission.id,
    name: "Task A",
    description:
      "Initial task with no dependencies.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Successful WorkforceResult",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const taskB: Task = {
    id: "task-workflow-progression-b",
    missionId: mission.id,
    name: "Task B",
    description:
      "Task that depends on Task A.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [
      taskA.id,
    ],
    inputReferences: [],
    expectedOutputs: [
      "Successful WorkforceResult",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const taskC: Task = {
    id: "task-workflow-progression-c",
    missionId: mission.id,
    name: "Task C",
    description:
      "Task that depends on Task B.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [
      taskB.id,
    ],
    inputReferences: [],
    expectedOutputs: [
      "Successful WorkforceResult",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const workflow: Workflow = {
    id: "workflow-workflow-progression-test",
    missionId: mission.id,
    name:
      "Controlled Workflow Progression",
    description:
      "Verify progressive dependency unlocking.",
    taskIds: [
      taskA.id,
      taskB.id,
      taskC.id,
    ],
    requiresApproval: false,
  };

  registry.registerAgent(agent);
  registry.registerMission(mission);

  registry.registerTask(taskA);
  registry.registerTask(taskB);
  registry.registerTask(taskC);

  registry.registerWorkflow(
    workflow,
  );

  const workforceExecutor =
    new WorkforceExecutor(
      registry,
      [
        new TestExecutionAdapter(),
      ],
    );

  const workflowExecutor =
    new WorkflowExecutor(
      registry,
      workforceExecutor,
    );

  /*
   * Initial state:
   *
   * A = ready
   * B = blocked by A
   * C = blocked by B
   */
  if (
    taskA.status !== "ready" ||
    taskB.status !== "ready" ||
    taskC.status !== "ready"
  ) {
    throw new Error(
      "Initial task state was not configured correctly.",
    );
  }

  console.log(
    "Initial workflow state: READY CHAIN",
  );

  const result =
    await workflowExecutor.execute(
      workflow.id,
    );

  /*
   * Task A must have executed successfully.
   */
  const completedA =
    registry.getTask(taskA.id);

  if (
    completedA?.status !==
    "completed"
  ) {
    throw new Error(
      `Task A did not complete. Status: "${completedA?.status}".`,
    );
  }

  const evaluationA =
    result.evaluations.find(
      (evaluation) =>
        evaluation.taskId ===
        taskA.id,
    );

  if (!evaluationA) {
    throw new Error(
      "Task A evaluation was not returned.",
    );
  }

  if (
    evaluationA.status !==
    "completed"
  ) {
    throw new Error(
      `Task A evaluation was not completed. Status: "${evaluationA.status}".`,
    );
  }

  if (
    evaluationA.result?.status !==
    "success"
  ) {
    throw new Error(
      "Task A did not produce a successful WorkforceResult.",
    );
  }

  console.log(
    "Task A execution: SUCCESS",
  );

  /*
   * Task B must have become executable
   * after Task A completed.
   */
  const completedB =
    registry.getTask(taskB.id);

  if (
    completedB?.status !==
    "completed"
  ) {
    throw new Error(
      `Task B did not progress after Task A. Status: "${completedB?.status}".`,
    );
  }

  const evaluationB =
    result.evaluations.find(
      (evaluation) =>
        evaluation.taskId ===
        taskB.id,
    );

  if (!evaluationB) {
    throw new Error(
      "Task B evaluation was not returned.",
    );
  }

  if (
    evaluationB.status !==
    "completed"
  ) {
    throw new Error(
      `Task B evaluation was not completed. Status: "${evaluationB.status}".`,
    );
  }

  if (
    evaluationB.result?.status !==
    "success"
  ) {
    throw new Error(
      "Task B did not produce a successful WorkforceResult.",
    );
  }

  console.log(
    "Task B dependency progression: SUCCESS",
  );

  /*
   * Task C must have become executable
   * after Task B completed.
   */
  const completedC =
    registry.getTask(taskC.id);

  if (
    completedC?.status !==
    "completed"
  ) {
    throw new Error(
      `Task C did not progress after Task B. Status: "${completedC?.status}".`,
    );
  }

  const evaluationC =
    result.evaluations.find(
      (evaluation) =>
        evaluation.taskId ===
        taskC.id,
    );

  if (!evaluationC) {
    throw new Error(
      "Task C evaluation was not returned.",
    );
  }

  if (
    evaluationC.status !==
    "completed"
  ) {
    throw new Error(
      `Task C evaluation was not completed. Status: "${evaluationC.status}".`,
    );
  }

  if (
    evaluationC.result?.status !==
    "success"
  ) {
    throw new Error(
      "Task C did not produce a successful WorkforceResult.",
    );
  }

  console.log(
    "Task C dependency progression: SUCCESS",
  );

  /*
   * The registry must preserve the
   * completed state of every task.
   */
  const registeredA =
    registry.getTask(taskA.id);

  const registeredB =
    registry.getTask(taskB.id);

  const registeredC =
    registry.getTask(taskC.id);

  if (
    registeredA?.status !==
      "completed" ||
    registeredB?.status !==
      "completed" ||
    registeredC?.status !==
      "completed"
  ) {
    throw new Error(
      "Registry task state was not preserved as completed.",
    );
  }

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
