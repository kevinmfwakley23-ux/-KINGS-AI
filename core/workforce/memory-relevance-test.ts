import {
  MemoryRelevance,
} from "./memory-relevance";

import type {
  MemoryReference,
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

const now =
  "2026-08-12T16:00:00.000Z";

const task: Task = {
  id:
    "TASK-05-5-8",
  missionId:
    "MISSION-05-5",
  name:
    "Implement shared memory relevance",
  description:
    "Select deterministic task-scoped memory for execution context.",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "ready",
  dependencyIds: [],
  inputReferences: [
    "memory architecture",
    "retrieval layer",
  ],
  expectedOutputs: [
    "memory relevance",
    "execution context",
  ],
  createdAt:
    now,
  updatedAt:
    now,
};

function memory(
  id: string,
  overrides:
    Partial<MemoryReference> = {},
): MemoryReference {
  return {
    id,
    type:
      "semantic",
    summary:
      "Shared memory relevance retrieval architecture for execution context.",
    sourceReferences: [
      `SOURCE-${id}`,
    ],
    missionId:
      task.missionId,
    authoritative:
      false,
    createdAt:
      now,
    updatedAt:
      now,
    ...overrides,
  };
}

const relevance =
  new MemoryRelevance();

const authoritative =
  memory(
    "MEMORY-05-5-8-AUTH",
    {
      authoritative:
        true,
    },
  );

const exact =
  memory(
    "MEMORY-05-5-8-TASK",
    {
      type:
        "procedural",
      taskId:
        task.id,
      summary:
        "Task-specific memory relevance retrieval procedure.",
    },
  );

const unrelated =
  memory(
    "MEMORY-05-5-8-UNRELATED",
    {
      missionId:
        "MISSION-OTHER",
      summary:
        "Unrelated historical material.",
      sourceReferences: [
        "OTHER-SOURCE",
      ],
    },
  );

const ranked =
  relevance.rank(
    task,
    [
      unrelated,
      authoritative,
      exact,
    ],
    3,
  );

assert(
  ranked.length === 3,
  "Shared relevance ranking returned the wrong number of memories",
);

assert(
  ranked[0].memory.id ===
    exact.id,
  "Exact task memory did not rank first",
);

console.log(
  "05.5.8 exact task relevance: SUCCESS",
);

assert(
  ranked.some(
    (entry) =>
      entry.memory.id ===
      authoritative.id,
  ),
  "Authoritative memory disappeared from ranking",
);

console.log(
  "05.5.8 authoritative memory preservation: SUCCESS",
);

assert(
  ranked[0].reasons.includes(
    "exact task match",
  ),
  "Relevance explanation was not preserved",
);

console.log(
  "05.5.8 relevance explanation: SUCCESS",
);

const limited =
  relevance.rank(
    task,
    [
      unrelated,
      authoritative,
      exact,
    ],
    1,
  );

assert(
  limited.length === 1,
  "Shared relevance limit was not enforced",
);

console.log(
  "05.5.8 ranking limit: SUCCESS",
);

assert(
  relevance.rank(
    task,
    [
      exact,
    ],
    0,
  ).length === 0,
  "Shared relevance zero-limit safety failed",
);

console.log(
  "05.5.8 explicit zero-limit safety: SUCCESS",
);

let invalidRejected =
  false;

try {
  relevance.rank(
    task,
    [
      exact,
    ],
    -1,
  );
} catch {
  invalidRejected = true;
}

assert(
  invalidRejected,
  "Negative relevance limit was not rejected",
);

console.log(
  "05.5.8 invalid-limit rejection: SUCCESS",
);

let fractionalRejected =
  false;

try {
  relevance.rank(
    task,
    [
      exact,
    ],
    1.5,
  );
} catch {
  fractionalRejected = true;
}

assert(
  fractionalRejected,
  "Fractional relevance limit was not rejected",
);

console.log(
  "05.5.8 fractional-limit rejection: SUCCESS",
);

const first =
  relevance.rank(
    task,
    [
      unrelated,
      authoritative,
      exact,
    ],
    3,
  );

const second =
  relevance.rank(
    task,
    [
      exact,
      unrelated,
      authoritative,
    ],
    3,
  );

assert(
  JSON.stringify(first) ===
    JSON.stringify(second),
  "Shared relevance ranking was not input-order deterministic",
);

console.log(
  "05.5.8 input-order determinism: SUCCESS",
);

const isolated =
  relevance.rank(
    task,
    [
      exact,
    ],
    1,
  );

isolated[0].memory.sourceReferences.push(
  "MUTATED",
);

isolated[0].reasons.push(
  "MUTATED",
);

const reread =
  relevance.rank(
    task,
    [
      exact,
    ],
    1,
  );

assert(
  !reread[0].memory.sourceReferences.includes(
    "MUTATED",
  ),
  "Ranked memory provenance was not isolated",
);

assert(
  !reread[0].reasons.includes(
    "MUTATED",
  ),
  "Ranked memory reasons were not isolated",
);

console.log(
  "05.5.8 ranked-memory defensive isolation: SUCCESS",
);

console.log(
  "TREE-05.5.8 SHARED MEMORY RELEVANCE: SUCCESS",
);
