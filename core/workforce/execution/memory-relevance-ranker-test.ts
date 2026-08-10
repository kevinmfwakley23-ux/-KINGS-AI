import {
  MemoryRelevanceRanker,
} from "./memory-relevance-ranker";

import type {
  MemoryReference,
  Task,
} from "../types";

const now =
  new Date().toISOString();

const task: Task = {
  id:
    "TASK-012",
  missionId:
    "MISSION-012",
  name:
    "Implement memory retrieval",
  description:
    "Implement intelligent mission memory retrieval for execution context.",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "ready",
  dependencyIds: [],
  inputReferences: [
    "memory-architecture",
  ],
  expectedOutputs: [
    "memory retrieval",
    "execution context",
  ],
  createdAt:
    now,
  updatedAt:
    now,
};

const authoritativeRelevant:
  MemoryReference = {
    id:
      "MEMORY-RELEVANT-AUTH",
    type:
      "semantic",
    summary:
      "Memory retrieval architecture for execution context",
    sourceReferences: [
      "memory-architecture",
    ],
    missionId:
      task.missionId,
    authoritative:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };

const exactTaskMemory:
  MemoryReference = {
    id:
      "MEMORY-TASK",
    type:
      "procedural",
    summary:
      "Task-specific retrieval procedure",
    sourceReferences: [
      "task-procedure",
    ],
    missionId:
      task.missionId,
    taskId:
      task.id,
    authoritative:
      false,
    createdAt:
      now,
    updatedAt:
      now,
  };

const unrelatedMemory:
  MemoryReference = {
    id:
      "MEMORY-UNRELATED",
    type:
      "episodic",
    summary:
      "Unrelated historical project discussion",
    sourceReferences: [
      "old-project",
    ],
    missionId:
      task.missionId,
    authoritative:
      false,
    createdAt:
      now,
    updatedAt:
      now,
  };

const ranker =
  new MemoryRelevanceRanker();

const ranked =
  ranker.rank(
    task,
    [
      unrelatedMemory,
      authoritativeRelevant,
      exactTaskMemory,
    ],
    3,
  );

if (
  ranked.length !== 3
) {
  throw new Error(
    "All candidate memories were not ranked",
  );
}

if (
  ranked[0].memory.id !==
  "MEMORY-TASK"
) {
  throw new Error(
    "Exact task memory was not ranked first",
  );
}

console.log(
  "Exact task relevance ranking: SUCCESS",
);

if (
  ranked[1].memory.id !==
  "MEMORY-RELEVANT-AUTH"
) {
  throw new Error(
    "Authoritative relevant memory was not ranked second",
  );
}

console.log(
  "Authoritative relevance ranking: SUCCESS",
);

if (
  ranked[2].memory.id !==
  "MEMORY-UNRELATED"
) {
  throw new Error(
    "Unrelated memory was not ranked last",
  );
}

console.log(
  "Low-relevance memory deprioritization: SUCCESS",
);

const limited =
  ranker.rank(
    task,
    [
      unrelatedMemory,
      authoritativeRelevant,
      exactTaskMemory,
    ],
    2,
  );

if (
  limited.length !== 2
) {
  throw new Error(
    "Memory ranking limit was not enforced",
  );
}

console.log(
  "Memory ranking budget enforcement: SUCCESS",
);

console.log(
  "INTELLIGENCE-012 memory relevance authority: SUCCESS",
);
