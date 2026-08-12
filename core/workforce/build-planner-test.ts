import {
  TaskControl,
} from "./task-control";

import {
  WorkforceRegistry,
} from "./registry";

import {
  WorkflowPlanningAuthority,
} from "./workflow-planner";

import {
  BuildPlanningAuthority,
} from "./build-planner";

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

function now(): string {
  return new Date().toISOString();
}

function createTask(
  missionId: string,
  taskId: string,
): any {
  return {
    id:
      taskId,
    missionId,
    name:
      "Tree 06.2 Build Planning Test",
    description:
      "Produce a governed build plan for Tree 06.2.",
    assignedAgentId:
      "agent-tree-062",
    requiredCapabilities: [
      "coding",
    ],
    requiredToolIds: [],
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Governed build plan",
    ],
    createdAt:
      now(),
    updatedAt:
      now(),
  };
}

function createMissionPlan(
  missionId: string,
  taskId: string,
): any {
  const milestone:
    any = {
    id:
      "milestone-tree-062",
    missionId,
    name:
      "Tree 06.2 milestone",
    objective:
      "Create a governed build plan.",
    taskIds: [
      taskId,
    ],
    status:
      "pending",
    createdAt:
      now(),
    updatedAt:
      now(),
  };

  return {
    id:
      "mission-plan-tree-062",
    missionId,
    version:
      1,
    objectives: [
      "Create a governed build plan.",
    ],
    acceptanceCriteria: [
      "Build plan is valid.",
    ],
    milestones: [
      milestone,
    ],
    decisions: [],
    createdAt:
      now(),
    updatedAt:
      now(),
  };
}

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const agent: any = {
    id:
      "agent-tree-062",
    name:
      "Tree 06.2 Agent",
    role:
      "Build planning worker",
    description:
      "Tree 06.2 test worker",
    capabilities: [
      "coding",
    ],
    toolIds: [],
    status:
      "available",
  };

  registry.registerAgent(
    agent,
  );

  const taskControl =
    new TaskControl(
      registry,
    );

  const workflowPlanner =
    new WorkflowPlanningAuthority(
      taskControl,
    );

  const workUnits =
    new (
      require(
        "./work-unit-registry",
      ).WorkUnitRegistry
    )();

  const authority =
    new BuildPlanningAuthority(
      workflowPlanner,
      workUnits,
    );

  const missionId =
    "mission-tree-062";

  const taskId =
    "task-tree-062";

  const task =
    createTask(
      missionId,
      taskId,
    );

  registry.registerTask(
    task,
  );

  const result =
    authority.plan({
      missionPlan:
        createMissionPlan(
          missionId,
          taskId,
        ),
      milestoneId:
        "milestone-tree-062",
      tasks: [
        task,
      ],
      workUnitDefaults: {
        role:
          "Build planning worker",
        capabilityIds: [
          "coding",
        ],
        allowedToolIds: [],
        allowedPaths: [
          "core/workforce",
        ],
        maxTimeMs:
          60_000,
        maxTokens:
          10_000,
        maxIterations:
          3,
        requiredEvidenceTypes: [
          "test",
        ],
        approved:
          true,
      },
    });

  assert(
    result.workflow.planId ===
      "mission-plan-tree-062",
    "Build planning must preserve the mission plan identity.",
  );

  assert(
    result.workflow.orderedTaskIds.length ===
      1,
    "Build planning must produce the ordered task list.",
  );

  assert(
    result.workflow.orderedTaskIds[0] ===
      taskId,
    "Build planning must preserve task order.",
  );

  assert(
    result.workflow.proposals.length ===
      1,
    "Build planning must produce one proposal for the bounded task.",
  );

  const contract =
    result.workUnitContracts[
      taskId
    ];

  assert(
    !!contract,
    "Build planning must produce a Work Unit Contract.",
  );

  assert(
    contract.approved ===
      true,
    "Approved planning input must produce an approved Work Unit.",
  );

  assert(
    contract.objective ===
      task.description,
    "Work Unit objective must preserve the task objective.",
  );

  assert(
    contract.acceptanceCriteria.includes(
      "Governed build plan",
    ),
    "Work Unit acceptance criteria must preserve expected outputs.",
  );

  authority.bind(
    result,
  );

  assert(
    workUnits.has(
      taskId,
    ),
    "Build planning must be able to bind the generated Work Unit.",
  );

  const rebound =
    workUnits.require(
      taskId,
    );

  assert(
    rebound.id ===
      contract.id,
    "Bound Work Unit must preserve the planned contract.",
  );

  console.log(
    "06.2 build-plan creation: SUCCESS",
  );

  console.log(
    "06.2 dependency-ordered task planning: SUCCESS",
  );

  console.log(
    "06.2 Work Unit Contract generation: SUCCESS",
  );

  console.log(
    "06.2 Work Unit binding: SUCCESS",
  );

  console.log(
    "TREE-06.2 BUILD PLANNING: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
