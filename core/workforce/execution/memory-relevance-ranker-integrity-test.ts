import {
  MemoryRelevanceRanker,
} from "./memory-relevance-ranker";

import type {
  MemoryReference,
  Task,
} from "../types";

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
  "2026-08-12T15:00:00.000Z";

const task:
  Task = {
  id:
    "TASK-05-5-4",
  missionId:
    "MISSION-05-5",
  name:
    "Memory relevance integrity",
  description:
    "Validate task-scoped memory ranking.",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "pending",
  dependencyIds: [],
  inputReferences: [],
  expectedOutputs: [
    "Deterministic memory relevance ranking.",
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
      "Memory retrieval architecture for the current mission and task.",
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

const ranker =
  new MemoryRelevanceRanker();

const exactTask =
  memory(
    "MEMORY-05-5-4-TASK",
    {
      taskId:
        task.id,
      type:
        "procedural",
      summary:
        "Exact task memory for memory relevance retrieval architecture.",
    },
  );

const authoritativeMission =
  memory(
    "MEMORY-05-5-4-AUTH",
    {
      authoritative:
        true,
      summary:
        "Authoritative mission memory for retrieval architecture.",
    },
  );

const sameMission =
  memory(
    "MEMORY-05-5-4-MISSION",
    {
      summary:
        "Mission memory containing retrieval architecture information.",
    },
  );

const unrelated =
  memory(
    "MEMORY-05-5-4-UNRELATED",
    {
      missionId:
        "MISSION-OTHER",
      summary:
        "Completely unrelated accounting information.",
      sourceReferences: [
        "SOURCE-UNRELATED",
      ],
    },
  );

const memories = [
  unrelated,
  sameMission,
  authoritativeMission,
  exactTask,
];

const ranked =
  ranker.rank(
    task,
    memories,
    4,
  );

assert(
  ranked.length === 4,
  "All supplied memories should remain rankable.",
);

assert(
  ranked[0].memory.id ===
    exactTask.id,
  "Exact task memory was not ranked first.",
);

console.log(
  "05.5.4 exact task relevance: SUCCESS",
);

assert(
  ranked[1].memory.id ===
    authoritativeMission.id,
  "Authoritative mission memory was not prioritized after exact task memory.",
);

console.log(
  "05.5.4 authoritative relevance: SUCCESS",
);

assert(
  ranked.some(
    (item) =>
      item.memory.id ===
      sameMission.id,
  ),
  "Same-mission memory was not retained.",
);

console.log(
  "05.5.4 mission relevance: SUCCESS",
);

assert(
  ranked[ranked.length - 1].memory.id ===
    unrelated.id,
  "Unrelated memory was not deprioritized.",
);

console.log(
  "05.5.4 unrelated-memory deprioritization: SUCCESS",
);

assert(
  ranked[0].reasons.length > 0,
  "Ranked memory did not preserve relevance reasons.",
);

console.log(
  "05.5.4 relevance explanation preservation: SUCCESS",
);

const limited =
  ranker.rank(
    task,
    memories,
    2,
  );

assert(
  limited.length === 2 &&
    limited[0].memory.id ===
      exactTask.id,
  "Ranking limit was not enforced deterministically.",
);

console.log(
  "05.5.4 ranking limit: SUCCESS",
);

const zero =
  ranker.rank(
    task,
    memories,
    0,
  );

assert(
  zero.length === 0,
  "Explicit zero ranking limit was not respected.",
);

console.log(
  "05.5.4 explicit zero-limit safety: SUCCESS",
);

let negativeRejected =
  false;

try {
  ranker.rank(
    task,
    memories,
    -1,
  );
} catch (error) {
  negativeRejected =
    error instanceof Error &&
    error.message.includes(
      "non-negative integer",
    );
}

assert(
  negativeRejected,
  "Negative ranking limit was not rejected.",
);

console.log(
  "05.5.4 invalid-limit rejection: SUCCESS",
);

let fractionalRejected =
  false;

try {
  ranker.rank(
    task,
    memories,
    1.5,
  );
} catch (error) {
  fractionalRejected =
    error instanceof Error &&
    error.message.includes(
      "non-negative integer",
    );
}

assert(
  fractionalRejected,
  "Fractional ranking limit was not rejected.",
);

console.log(
  "05.5.4 fractional-limit rejection: SUCCESS",
);

const repeatedA =
  ranker.rank(
    task,
    memories,
    4,
  );

const repeatedB =
  ranker.rank(
    task,
    memories,
    4,
  );

assert(
  JSON.stringify(
    repeatedA,
  ) ===
    JSON.stringify(
      repeatedB,
    ),
  "Repeated memory ranking was not deterministic.",
);

console.log(
  "05.5.4 repeated-ranking determinism: SUCCESS",
);

const reordered =
  ranker.rank(
    task,
    [
      exactTask,
      unrelated,
      authoritativeMission,
      sameMission,
    ],
    4,
  );

assert(
  JSON.stringify(
    repeatedA,
  ) ===
    JSON.stringify(
      reordered,
    ),
  "Memory ranking changed when input order changed.",
);

console.log(
  "05.5.4 input-order determinism: SUCCESS",
);

const originalSourceReferences = [
  ...exactTask.sourceReferences,
];

repeatedA[0].memory.sourceReferences.push(
  "MUTATION-ATTEMPT",
);

assert(
  JSON.stringify(
    exactTask.sourceReferences,
  ) ===
    JSON.stringify(
      originalSourceReferences,
    ),
  "Ranked memory mutation leaked into the source memory.",
);

const freshRanking =
  ranker.rank(
    task,
    memories,
    4,
  );

assert(
  !freshRanking[0].memory.sourceReferences.includes(
    "MUTATION-ATTEMPT",
  ),
  "Ranked memory mutation leaked into subsequent retrieval.",
);

assert(
  freshRanking[0].memory.sourceReferences !==
    exactTask.sourceReferences,
  "Ranked memory provenance still shares the source array.",
);

console.log(
  "05.5.4 ranked-memory isolation: SUCCESS",
);

const noMatch =
  ranker.rank(
    {
      ...task,
      description:
        "zzzzzz impossible relevance token",
      name:
        "zzzzzz",
    },
    memories,
    4,
  );

assert(
  noMatch.length === 4,
  "Ranker incorrectly discarded low-score memories.",
);

assert(
  noMatch.every(
    (item) =>
      typeof item.score ===
        "number" &&
      Array.isArray(
        item.reasons,
      ),
  ),
  "Low-relevance ranking results lost score structure.",
);

console.log(
  "05.5.4 low-relevance result structure: SUCCESS",
);

console.log(
  "TREE-05.5.4 MEMORY RELEVANCE INTEGRITY: SUCCESS",
);
