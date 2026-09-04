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
  WorkforceExecutor,
} from "./executor";

import {
  TestExecutionAdapter,
} from "./test-adapter";

import {
  WorkUnitRegistry,
} from "../work-unit-registry";

import {
  registerTestWorkUnit,
} from "./test-work-unit";

import {
  TaskExecutionController,
} from "./task-execution";

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
    id: "tool-control-004",
    name: "CONTROL-004 Test Tool",
    description:
      "Tool used to verify execution lifecycle authority.",
    capabilities: ["test-tool"],
    enabled: true,
  };

  const agent: AgentDefinition = {
    id: "agent-control-004",
    name: "CONTROL-004 Test Agent",
    role: "Execution lifecycle worker",
    description:
      "Agent used to verify controlled task completion.",
    capabilities: ["test"],
    toolIds: [tool.id],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-control-004",
    name: "Task Execution Lifecycle Test",
    description:
      "Verify that task execution results are translated into controlled task state.",
    status: "active",
    objectives: [
      "Execute a ready task.",
      "Promote successful execution through TaskControl.",
      "Hold exclusive running state for the full execution window.",
      "Fail closed when the execution port throws.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const task: Task = {
    id: "task-control-004",
    missionId: mission.id,
    name: "Task Execution Lifecycle Test",
    description:
      "Verify controlled completion of a successful task.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "controlled task completion",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const throwingTask: Task = {
    ...task,
    id: "task-control-004-throws",
    name: "Task Execution Exception Test",
    description:
      "Verify that an execution exception cannot strand a task in running state.",
    expectedOutputs: [
      "fail-closed task state after execution exception",
    ],
  };

  registry.registerTool(tool);
  registry.registerAgent(agent);
  registry.registerMission(mission);
  registry.registerTask(task);
  registry.registerTask(throwingTask);

  const taskControl =
    new TaskControl(
      registry,
    );

  const workUnitRegistry =
    new WorkUnitRegistry();

  registerTestWorkUnit(
    workUnitRegistry,
    task.id,
  );

  const workforceExecutor =
    new WorkforceExecutor(
      registry,
      [new TestExecutionAdapter()],
      undefined,
      workUnitRegistry,
    );

  const observedStatuses: string[] = [];
  const executionController =
    new TaskExecutionController(
      registry,
      taskControl,
      {
        execute: async (taskId) => {
          observedStatuses.push(task.status);
          return workforceExecutor.execute(taskId);
        },
      },
    );

  const result =
    await executionController.execute(
      task.id,
    );

  assert(
    result.status === "success",
    "Workforce execution should succeed.",
  );

  assert(
    observedStatuses[0] === "running",
    "Task must be marked running before execution-port work begins.",
  );

  assert(
    task.status === "completed",
    "Successful execution should transition the task to completed.",
  );

  assert(
    task.updatedAt !== task.createdAt,
    "Task completion should update the task timestamp.",
  );

  let completedTaskRejected =
    false;

  try {
    await executionController.execute(
      task.id,
    );
  } catch {
    completedTaskRejected =
      true;
  }

  assert(
    completedTaskRejected,
    "A completed task must not be executed again.",
  );

  const throwingController =
    new TaskExecutionController(
      registry,
      taskControl,
      {
        execute: async () => {
          assert(
            throwingTask.status === "running",
            "Throwing execution port must still observe an owned running task.",
          );
          throw new Error("forced execution-port failure");
        },
      },
    );

  let executionErrorPreserved = false;
  try {
    await throwingController.execute(
      throwingTask.id,
    );
  } catch (error) {
    executionErrorPreserved =
      error instanceof Error &&
      error.message === "forced execution-port failure";
  }

  assert(
    executionErrorPreserved,
    "Execution-port exception should be preserved for diagnosis.",
  );

  assert(
    throwingTask.status === "failed",
    "Execution-port exception must transition an in-flight task to failed.",
  );

  console.log(
    "Controlled execution: SUCCESS",
  );

  console.log(
    "Running state held before adapter work: SUCCESS",
  );

  console.log(
    "Successful result promotes task: SUCCESS",
  );

  console.log(
    "Execution exception fails task closed: SUCCESS",
  );

  console.log(
    "Completed task re-execution rejected: SUCCESS",
  );

  console.log(
    "CONTROL-004 task execution lifecycle: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "CONTROL-004 task execution lifecycle: FAILED",
    );
    console.error(error);
    throw error;
  },
);
