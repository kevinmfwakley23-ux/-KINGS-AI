import type {
  AgentDefinition,
  Task,
} from "./types";

import {
  ContextCheckpointStore,
} from "./context-checkpointing";

import type {
  MissionExecutionContext,
} from "./execution/mission-execution-context";

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

const agent =
  {
    id: "agent-context-checkpoint",
    name: "Context Checkpoint Worker",
    role: "worker",
    capabilities: [],
  } as unknown as AgentDefinition;

const task =
  {
    id: "task-context-checkpoint",
    missionId:
      "mission-context-checkpoint",
    title: "Checkpoint context",
    description:
      "Preserve execution context.",
    status: "active",
  } as unknown as Task;

const context:
  MissionExecutionContext = {
    missionId:
      "mission-context-checkpoint",
    taskId:
      "task-context-checkpoint",
    agent,
    task,
    memories: [],
  };

const store =
  new ContextCheckpointStore();

const first =
  store.createCheckpoint({
    id:
      "CONTEXT-CHECKPOINT-001",
    missionId:
      "mission-context-checkpoint",
    taskId:
      "task-context-checkpoint",
    context,
    missionCheckpointId:
      "MISSION-CHECKPOINT-001",
    reason:
      "Worker context boundary reached.",
    sequence: 999,
    createdAt:
      "2026-08-11T00:00:00.000Z",
  });

assert(
  first.sequence === 1,
  "First context checkpoint sequence failed.",
);

assert(
  first.missionCheckpointId ===
    "MISSION-CHECKPOINT-001",
  "Mission checkpoint reference was not preserved.",
);

console.log(
  "03.7 context checkpoint creation: SUCCESS",
);

const secondContext:
  MissionExecutionContext = {
    ...context,
    memories: [
      ...context.memories,
    ],
  };

const second =
  store.createCheckpoint({
    id:
      "CONTEXT-CHECKPOINT-002",
    missionId:
      "mission-context-checkpoint",
    taskId:
      "task-context-checkpoint",
    context:
      secondContext,
    reason:
      "Worker context updated.",
    sequence: 500,
    createdAt:
      "2026-08-11T00:01:00.000Z",
  });

assert(
  second.sequence === 2,
  "Context checkpoint sequencing failed.",
);

console.log(
  "03.7 checkpoint sequencing: SUCCESS",
);

const latest =
  store.getLatestCheckpoint(
    "mission-context-checkpoint",
    "task-context-checkpoint",
  );

assert(
  latest?.id ===
    "CONTEXT-CHECKPOINT-002",
  "Latest context checkpoint selection failed.",
);

console.log(
  "03.7 latest checkpoint selection: SUCCESS",
);

const restored =
  store.restoreLatestCheckpoint(
    "mission-context-checkpoint",
    "task-context-checkpoint",
  );

assert(
  restored.missionId ===
    "mission-context-checkpoint",
  "Restored context mission was incorrect.",
);

assert(
  restored.taskId ===
    "task-context-checkpoint",
  "Restored context task was incorrect.",
);

assert(
  restored.agent === agent,
  "Restored context agent was not preserved.",
);

assert(
  restored.task === task,
  "Restored context task object was not preserved.",
);

console.log(
  "03.7 context restoration: SUCCESS",
);

const snapshot =
  store.snapshot(
    "mission-context-checkpoint",
    "task-context-checkpoint",
  );

assert(
  snapshot.count === 2,
  "Checkpoint snapshot count failed.",
);

assert(
  snapshot.latest?.id ===
    "CONTEXT-CHECKPOINT-002",
  "Checkpoint snapshot latest state failed.",
);

console.log(
  "03.7 checkpoint snapshot: SUCCESS",
);

let rejectedMission =
  false;

try {
  store.createCheckpoint({
    id:
      "CONTEXT-CHECKPOINT-BAD-MISSION",
    missionId:
      "different-mission",
    taskId:
      "task-context-checkpoint",
    context,
    reason:
      "Invalid checkpoint.",
    sequence: 1,
    createdAt:
      "2026-08-11T00:02:00.000Z",
  });
} catch {
  rejectedMission = true;
}

assert(
  rejectedMission,
  "Mismatched mission context was accepted.",
);

console.log(
  "03.7 context authority boundary: SUCCESS",
);

let rejectedTask =
  false;

try {
  store.createCheckpoint({
    id:
      "CONTEXT-CHECKPOINT-BAD-TASK",
    missionId:
      "mission-context-checkpoint",
    taskId:
      "different-task",
    context,
    reason:
      "Invalid checkpoint.",
    sequence: 1,
    createdAt:
      "2026-08-11T00:03:00.000Z",
  });
} catch {
  rejectedTask = true;
}

assert(
  rejectedTask,
  "Mismatched task context was accepted.",
);

console.log(
  "03.7 task authority boundary: SUCCESS",
);

const duplicateId =
  "CONTEXT-CHECKPOINT-002";

let rejectedDuplicate =
  false;

try {
  store.createCheckpoint({
    id: duplicateId,
    missionId:
      "mission-context-checkpoint",
    taskId:
      "task-context-checkpoint",
    context,
    reason:
      "Duplicate checkpoint.",
    sequence: 3,
    createdAt:
      "2026-08-11T00:04:00.000Z",
  });
} catch {
  rejectedDuplicate = true;
}

assert(
  rejectedDuplicate,
  "Duplicate checkpoint was accepted.",
);

console.log(
  "03.7 duplicate checkpoint rejection: SUCCESS",
);

store.clear();

let restoreFailed =
  false;

try {
  store.restoreLatestCheckpoint(
    "mission-context-checkpoint",
    "task-context-checkpoint",
  );
} catch {
  restoreFailed = true;
}

assert(
  restoreFailed,
  "Empty checkpoint store restored nonexistent context.",
);

console.log(
  "03.7 empty checkpoint protection: SUCCESS",
);

console.log(
  "TREE-03.7 CONTEXT CHECKPOINTING: SUCCESS",
);
