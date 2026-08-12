import type {
  Mission,
  Task,
} from "./types";

import {
  MissionContinuityStore,
} from "./mission-continuity";

import {
  TaskStateSelector,
} from "./task-state-selection";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(message);
  }
}

const now =
  new Date().toISOString();

const mission: Mission = {
  id:
    "mission-tree-03-4-test",
  name:
    "TREE 03.4 Task State Selection",
  description:
    "Verify bounded task-state selection.",
  status:
    "active",
  objectives: [
    "Select only relevant execution state.",
  ],
  sourceReferences: [
    "tree-03.4",
  ],
  createdAt:
    now,
  updatedAt:
    now,
};

const continuity =
  new MissionContinuityStore();

continuity.registerMission(
  mission,
);

continuity.registerPlan({
  id:
    "plan-tree-03-4-test",
  missionId:
    mission.id,
  version:
    1,
  objective:
    "Validate task-state selection.",
  milestones: [
    {
      id:
        "milestone-tree-03-4",
      missionId:
        mission.id,
      name:
        "Task State",
      objective:
        "Select relevant state.",
      taskIds: [
        "task-dependency",
        "task-current",
        "task-related-running",
        "task-related-blocked",
        "task-unrelated",
      ],
      dependencyIds: [],
      status:
        "active",
    },
  ],
  decisionIds: [],
  acceptanceCriteria: [
    "Relevant task state is selected.",
  ],
  locked:
    true,
  approvedByHuman:
    true,
  createdAt:
    now,
  updatedAt:
    now,
});

const dependency: Task = {
  id:
    "task-dependency",
  missionId:
    mission.id,
  name:
    "Dependency",
  description:
    "Completed dependency.",
  assignedAgentId:
    "agent-test",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "completed",
  dependencyIds: [],
  inputReferences: [],
  expectedOutputs: [],
  createdAt:
    now,
  updatedAt:
    now,
};

const currentTask: Task = {
  id:
    "task-current",
  missionId:
    mission.id,
  name:
    "Current Task",
  description:
    "Task being executed.",
  assignedAgentId:
    "agent-test",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "ready",
  dependencyIds: [
    dependency.id,
  ],
  inputReferences: [],
  expectedOutputs: [],
  createdAt:
    now,
  updatedAt:
    now,
};

const runningTask: Task = {
  id:
    "task-related-running",
  missionId:
    mission.id,
  name:
    "Running Related Task",
  description:
    "Relevant active task.",
  assignedAgentId:
    "agent-test",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "running",
  dependencyIds: [],
  inputReferences: [],
  expectedOutputs: [],
  createdAt:
    now,
  updatedAt:
    now,
};

const blockedTask: Task = {
  id:
    "task-related-blocked",
  missionId:
    mission.id,
  name:
    "Blocked Related Task",
  description:
    "Relevant blocked task.",
  assignedAgentId:
    "agent-test",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "blocked",
  dependencyIds: [],
  inputReferences: [],
  expectedOutputs: [],
  createdAt:
    now,
  updatedAt:
    now,
};

const unrelatedTask: Task = {
  id:
    "task-unrelated",
  missionId:
    mission.id,
  name:
    "Completed Unrelated Task",
  description:
    "Completed task should not consume related-state budget.",
  assignedAgentId:
    "agent-test",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "completed",
  dependencyIds: [],
  inputReferences: [],
  expectedOutputs: [],
  createdAt:
    now,
  updatedAt:
    now,
};

const selector =
  new TaskStateSelector(
    continuity,
    {
      maxDependencies: 5,
      maxRelatedTasks: 2,
    },
  );

const selection =
  selector.select(
    currentTask,
    [
      dependency,
      currentTask,
      runningTask,
      blockedTask,
      unrelatedTask,
    ],
  );

assert(
  selection.missionId ===
    mission.id,
  "Task state selection returned the wrong mission.",
);

assert(
  selection.taskId ===
    currentTask.id,
  "Task state selection returned the wrong task.",
);

assert(
  selection.missionState.missionId ===
    mission.id,
  "Mission state was not preserved.",
);

assert(
  selection.currentTask.status ===
    "ready",
  "Current task state was not preserved.",
);

assert(
  selection.dependencies.length ===
    1,
  "Dependency selection failed.",
);

assert(
  selection.dependencies[0].id ===
    dependency.id,
  "Incorrect dependency was selected.",
);

assert(
  selection.relatedTasks.length ===
    2,
  "Related-task budget was not enforced.",
);

assert(
  selection.relatedTasks[0].id ===
    runningTask.id,
  "Highest-priority running task was not selected first.",
);

assert(
  selection.relatedTasks[1].id ===
    blockedTask.id,
  "Blocked related task was not selected.",
);

assert(
  !selection.relatedTasks.some(
    (task) =>
      task.id ===
      unrelatedTask.id,
  ),
  "Irrelevant completed task was selected.",
);

selection.missionState.activeTaskIds.push(
  "mutation-test",
);

const secondSelection =
  selector.select(
    currentTask,
    [
      dependency,
      currentTask,
      runningTask,
      blockedTask,
      unrelatedTask,
    ],
  );

assert(
  !secondSelection.missionState.activeTaskIds.includes(
    "mutation-test",
  ),
  "Selected mission state leaked mutation into authoritative state.",
);

assert(
  secondSelection.currentTask.dependencyIds !==
    currentTask.dependencyIds,
  "Task dependency state was not copied.",
);

console.log(
  "03.4 mission state selection: SUCCESS",
);

console.log(
  "03.4 current task state selection: SUCCESS",
);

console.log(
  "03.4 dependency state selection: SUCCESS",
);

console.log(
  "03.4 related workflow state selection: SUCCESS",
);

console.log(
  "03.4 related-state budget enforcement: SUCCESS",
);

console.log(
  "03.4 relevance prioritization: SUCCESS",
);

console.log(
  "03.4 authoritative state mutation protection: SUCCESS",
);

console.log(
  "03.4 completed irrelevant state exclusion: SUCCESS",
);

console.log(
  "TREE-03.4 TASK-STATE SELECTION: SUCCESS",
);
