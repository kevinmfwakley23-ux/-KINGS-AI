import {
  WorkforceRegistry,
} from "./registry";

import {
  TaskControl,
} from "./task-control";

import type {
  Task,
} from "./types";

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

function createTask(
  status: Task["status"],
): Task {
  return {
    id: "task-control-001",
    missionId: "mission-001",
    name: "Task Control Test",
    description:
      "Verify controlled task state transitions.",
    assignedAgentId: "agent-001",
    requiredCapabilities: [],
    requiredToolIds: [],
    status,
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "controlled transition",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };
}

const registry =
  new WorkforceRegistry();

const control =
  new TaskControl(registry);

const validTask =
  createTask("pending");

registry.registerTask(
  validTask,
);

const validation =
  control.validate(validTask);

assert(
  validation.valid,
  "Valid task contract should pass validation.",
);

control.transition(
  validTask.id,
  "ready",
);

assert(
  validTask.status === "ready",
  "Pending task should transition to ready.",
);

control.transition(
  validTask.id,
  "running",
);

assert(
  validTask.status === "running",
  "Ready task should transition to running.",
);

control.transition(
  validTask.id,
  "completed",
);

assert(
  validTask.status === "completed",
  "Running task should transition to completed.",
);

let invalidTransitionRejected =
  false;

try {
  control.transition(
    validTask.id,
    "running",
  );
} catch {
  invalidTransitionRejected =
    true;
}

assert(
  invalidTransitionRejected,
  "Completed task must reject an invalid transition.",
);

const invalidTask =
  createTask("pending");

invalidTask.name = "";

const invalidValidation =
  control.validate(invalidTask);

assert(
  !invalidValidation.valid,
  "Invalid task contract should fail validation.",
);

console.log(
  "Valid task contract: SUCCESS",
);

console.log(
  "Controlled state progression: SUCCESS",
);

console.log(
  "Invalid transition rejection: SUCCESS",
);

console.log(
  "Invalid task contract rejection: SUCCESS",
);

console.log(
  "CONTROL-001 task control boundary: SUCCESS",
);
