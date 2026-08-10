import type {
  Task,
} from "./types";

import type {
  MissionPlan,
} from "./mission-continuity";

import {
  WorkforceRegistry,
} from "./registry";

import {
  TaskControl,
} from "./task-control";

import {
  WorkflowPlanningAuthority,
} from "./workflow-planner";

import {
  validateWorkUnitContract,
} from "./work-unit-contract";

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

function createPlan(
  taskIds: string[] = [
    "TASK-020-A",
    "TASK-020-B",
    "TASK-020-C",
  ],
): MissionPlan {
  const now =
    new Date().toISOString();

  return {
    id:
      "PLAN-020-TEST",
    missionId:
      "MISSION-020-TEST",
    version:
      1,
    objective:
      "Build the 020 planning foundation.",
    milestones: [
      {
        id:
          "MILESTONE-020-A",
        missionId:
          "MISSION-020-TEST",
        name:
          "Planning Foundation",
        objective:
          "Create an ordered bounded workforce plan.",
        taskIds: [
          ...taskIds,
        ],
        dependencyIds: [],
        status:
          "active",
      },
    ],
    decisionIds: [],
    acceptanceCriteria: [
      "All planned tasks are ordered.",
      "Every task has a bounded work unit.",
      "Dependencies are preserved.",
    ],
    locked:
      true,
    approvedByHuman:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function createTask(
  id: string,
  dependencies: string[],
): Task {
  const now =
    new Date().toISOString();

  return {
    id,
    missionId:
      "MISSION-020-TEST",
    name:
      `Task ${id}`,
    description:
      `Execute objective for ${id}.`,
    requiredCapabilities: [
      "capability.build",
    ],
    requiredToolIds: [
      "tool.build",
    ],
    status:
      "pending",
    dependencyIds:
      dependencies,
    inputReferences: [
      "project-brain",
    ],
    knowledgeQuery: {
      query:
        "authoritative project knowledge",
      memoryTypes: [
        "semantic",
        "procedural",
      ],
      authoritativeOnly:
        true,
      limit:
        5,
    },
    expectedOutputs: [
      `Evidence for ${id}`,
    ],
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function createPlanner(
  tasks: Task[],
): WorkflowPlanningAuthority {
  const registry =
    new WorkforceRegistry();

  for (
    const task of tasks
  ) {
    registry.registerTask(
      task,
    );
  }

  const taskControl =
    new TaskControl(
      registry,
    );

  return new WorkflowPlanningAuthority(
    taskControl,
  );
}

function createRequest(
  tasks: Task[],
  taskIds: string[] = [
    "TASK-020-A",
    "TASK-020-B",
    "TASK-020-C",
  ],
) {
  return {
    missionPlan:
      createPlan(
        taskIds,
      ),
    milestoneId:
      "MILESTONE-020-A",
    tasks,
    workUnitDefaults: {
      role:
        "Builder Worker",
      capabilityIds: [
        "capability.build",
      ],
      allowedToolIds: [
        "tool.build",
      ],
      allowedPaths: [
        "project/",
      ],
      maxTimeMs:
        120000,
      maxTokens:
        12000,
      maxIterations:
        10,
      requiredEvidenceTypes: [
        "test-result",
        "artifact",
      ],
      approved:
        false,
    },
  };
}

async function main(): Promise<void> {
  const tasks = [
    createTask(
      "TASK-020-A",
      [],
    ),
    createTask(
      "TASK-020-B",
      [
        "TASK-020-A",
      ],
    ),
    createTask(
      "TASK-020-C",
      [
        "TASK-020-B",
      ],
    ),
  ];

  const planner =
    createPlanner(
      tasks,
    );

  const result =
    planner.plan(
      createRequest(
        tasks,
      ),
    );

  assert(
    result.missionId ===
      "MISSION-020-TEST",
    "Planning result must preserve mission identity.",
  );

  assert(
    result.planId ===
      "PLAN-020-TEST",
    "Planning result must preserve plan identity.",
  );

  assert(
    result.orderedTaskIds.join(",") ===
      "TASK-020-A,TASK-020-B,TASK-020-C",
    "Planner must produce dependency-safe ordering.",
  );

  assert(
    result.proposals.length ===
      3,
    "Planner must produce one proposal per milestone task.",
  );

  const first =
    result.proposals[0];

  const second =
    result.proposals[1];

  const third =
    result.proposals[2];

  assert(
    first.task.id ===
      "TASK-020-A",
    "First proposal must contain the first task.",
  );

  assert(
    second.workUnit.dependencyIds.length ===
      1 &&
      second.workUnit.dependencyIds[0] ===
        "TASK-020-A",
    "Second work unit must preserve its dependency.",
  );

  assert(
    third.workUnit.dependencyIds.length ===
      1 &&
      third.workUnit.dependencyIds[0] ===
        "TASK-020-B",
    "Third work unit must preserve its dependency.",
  );

  assert(
    first.workUnit.objective ===
      first.task.description,
    "Work unit objective must preserve the task objective.",
  );

  assert(
    first.workUnit.approved ===
      false,
    "Planner must not self-approve a work unit.",
  );

  const validation =
    validateWorkUnitContract(
      first.workUnit,
    );

  assert(
    validation.valid ===
      false,
    "Unapproved work unit must fail contract validation.",
  );

  const approvedRequest =
    createRequest(
      tasks,
    );

  approvedRequest.workUnitDefaults.approved =
    true;

  const approvedResult =
    planner.plan(
      approvedRequest,
    );

  const approvedValidation =
    validateWorkUnitContract(
      approvedResult
        .proposals[0]
        .workUnit,
    );

  assert(
    approvedValidation.valid ===
      true,
    "Approved fully specified work unit must pass validation.",
  );

  const invalidTask =
    createTask(
      "TASK-020-INVALID",
      [],
    );

  invalidTask.name = "";

  let taskValidationRejected =
    false;

  try {
    createPlanner([
      invalidTask,
    ]).plan(
      createRequest(
        [
          invalidTask,
        ],
        [
          "TASK-020-INVALID",
        ],
      ),
    );
  } catch (
    error: unknown
  ) {
    taskValidationRejected = true;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    assert(
      message.includes(
        "failed TaskControl validation",
      ),
      "Planner must surface TaskControl validation failures.",
    );
  }

  assert(
    taskValidationRejected,
    "Planner must reject invalid tasks through TaskControl.",
  );

  const cycleTasks = [
    createTask(
      "TASK-020-X",
      [
        "TASK-020-Y",
      ],
    ),
    createTask(
      "TASK-020-Y",
      [
        "TASK-020-X",
      ],
    ),
    createTask(
      "TASK-020-Z",
      [],
    ),
  ];

  let cycleRejected =
    false;

  try {
    createPlanner(
      cycleTasks,
    ).plan(
      createRequest(
        cycleTasks,
        [
          "TASK-020-X",
          "TASK-020-Y",
          "TASK-020-Z",
        ],
      ),
    );
  } catch (
    error: unknown
  ) {
    cycleRejected = true;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    assert(
      message.includes(
        "dependency cycle detected",
      ),
      "Cycle rejection must identify the dependency cycle.",
    );
  }

  assert(
    cycleRejected,
    "Planner must reject dependency cycles.",
  );

  let missingTaskRejected =
    false;

  try {
    createPlanner([
      tasks[0],
    ]).plan(
      createRequest(
        [
          tasks[0],
        ],
      ),
    );
  } catch (
    error: unknown
  ) {
    missingTaskRejected = true;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    assert(
      message.includes(
        "references missing task",
      ),
      "Missing milestone task must be rejected.",
    );
  }

  assert(
    missingTaskRejected,
    "Planner must reject milestones containing missing tasks.",
  );

  console.log(
    "020 mission-aware planning: SUCCESS",
  );

  console.log(
    "020 milestone task validation: SUCCESS",
  );

  console.log(
    "020 TaskControl integration: SUCCESS",
  );

  console.log(
    "020 dependency ordering: SUCCESS",
  );

  console.log(
    "020 dependency cycle protection: SUCCESS",
  );

  console.log(
    "020 bounded Work Unit generation: SUCCESS",
  );

  console.log(
    "020 approval boundary preservation: SUCCESS",
  );

  console.log(
    "020 Work Unit contract validation: SUCCESS",
  );

  console.log(
    "020 missing-task protection: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-020 Workflow Planning Authority: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "INTELLIGENCE-020 Workflow Planning Authority: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
