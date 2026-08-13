import type {
  MemoryReference,
  Task,
} from "./types";

import {
  MemoryRetrievalQualityAuthority,
} from "./memory-retrieval-quality";

function assert(
  condition:
    boolean,
  message:
    string,
):
  void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function memory(
  id:
    string,
  summary:
    string,
  overrides:
    Partial<MemoryReference> = {},
):
  MemoryReference {
  return {
    id,
    type:
      "semantic",
    summary,
    sourceReferences:
      [
        `source-${id}`,
      ],
    missionId:
      "mission-memory-health-007",
    taskId:
      "task-memory-health-007",
    authoritative:
      false,
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

const task:
  Task = {
  id:
    "task-memory-health-007",
  missionId:
    "mission-memory-health-007",
  name:
    "Apply verified TypeScript architecture",
  description:
    "Use the verified TypeScript engineering architecture to complete the active task.",
  requiredCapabilities:
    [
      "coding",
    ],
  requiredToolIds:
    [],
  status:
    "ready",
  dependencyIds:
    [],
  inputReferences:
    [
      "typescript",
      "architecture",
    ],
  expectedOutputs:
    [
      "verified TypeScript implementation",
    ],
  createdAt:
    "2026-08-13T00:00:00.000Z",
  updatedAt:
    "2026-08-13T00:00:00.000Z",
};

const authority =
  new MemoryRetrievalQualityAuthority();

const best =
  memory(
    "memory-best",
    "Verified TypeScript architecture uses explicit return types and governed adapter boundaries.",
    {
      authoritative:
        true,
    },
  );

const related =
  memory(
    "memory-related",
    "TypeScript implementation notes for current project.",
  );

const unrelated =
  memory(
    "memory-unrelated",
    "Unrelated deployment notes from another project.",
    {
      missionId:
        "different-mission",
      taskId:
        "different-task",
    },
  );

const result =
  authority.evaluate(
    task,
    [
      best,
      related,
      unrelated,
    ],
    {
      now:
        "2026-08-13T00:00:00.000Z",
      limit:
        2,
      minimumQuality:
        0.45,
    },
  );

assert(
  result.selectedMemoryIds.includes(
    "memory-best",
  ),
  "Highest-quality relevant memory must be selected.",
);

console.log(
  "007.MEMORY relevant authoritative retrieval: SUCCESS",
);

assert(
  result.selectedMemoryIds.length ===
    2,
  "Retrieval must respect the configured result limit.",
);

console.log(
  "007.MEMORY bounded retrieval selection: SUCCESS",
);

const bestQuality =
  result.candidates.find(
    (
      candidate,
    ) =>
      candidate.memoryId ===
      "memory-best",
  );

assert(
  bestQuality !==
    undefined,
  "Best memory must have a quality assessment.",
);

assert(
  bestQuality!.quality >
    0.70,
  "Strongly relevant authoritative memory must have high retrieval quality.",
);

console.log(
  "007.MEMORY retrieval quality scoring: SUCCESS",
);

const supersededResult =
  authority.evaluate(
    task,
    [
      best,
      related,
      memory(
        "memory-old-plan",
        "Old TypeScript architecture plan that was replaced.",
      ),
    ],
    {
      now:
        "2026-08-13T00:00:00.000Z",
      limit:
        3,
      minimumQuality:
        0.20,
      supersededMemoryIds:
        [
          "memory-old-plan",
        ],
    },
  );

assert(
  !supersededResult.selectedMemoryIds.includes(
    "memory-old-plan",
  ),
  "Superseded memory must not enter normal retrieval.",
);

console.log(
  "007.MEMORY superseded-memory retrieval protection: SUCCESS",
);

const missingProvenance =
  memory(
    "memory-no-provenance",
    "Relevant TypeScript architecture without provenance.",
    {
      sourceReferences:
        [],
    },
  );

const provenanceResult =
  authority.evaluate(
    task,
    [
      best,
      missingProvenance,
    ],
    {
      now:
        "2026-08-13T00:00:00.000Z",
      limit:
        2,
      minimumQuality:
        0,
    },
  );

assert(
  !provenanceResult.selectedMemoryIds.includes(
    "memory-no-provenance",
  ),
  "Memory without provenance must not be selected.",
);

console.log(
  "007.MEMORY provenance retrieval protection: SUCCESS",
);

const stale =
  memory(
    "memory-stale",
    "Old TypeScript architecture.",
    {
      updatedAt:
        "2025-01-01T00:00:00.000Z",
    },
  );

const staleResult =
  authority.evaluate(
    task,
    [
      best,
      stale,
    ],
    {
      now:
        "2026-08-13T00:00:00.000Z",
      limit:
        2,
      minimumQuality:
        0,
    },
  );

const staleQuality =
  staleResult.candidates.find(
    (
      candidate,
    ) =>
      candidate.memoryId ===
      "memory-stale",
  );

assert(
  staleQuality !==
    undefined,
  "Stale memory must still receive a measurable quality score.",
);

assert(
  staleQuality!.freshnessScore <
    0.20,
  "Stale memory must have a low freshness score.",
);

console.log(
  "007.MEMORY freshness-sensitive retrieval quality: SUCCESS",
);

const deterministicA =
  authority.evaluate(
    task,
    [
      best,
      related,
      unrelated,
    ],
    {
      now:
        "2026-08-13T00:00:00.000Z",
      limit:
        2,
      minimumQuality:
        0.45,
    },
  );

const deterministicB =
  authority.evaluate(
    task,
    [
      best,
      related,
      unrelated,
    ],
    {
      now:
        "2026-08-13T00:00:00.000Z",
      limit:
        2,
      minimumQuality:
        0.45,
    },
  );

assert(
  JSON.stringify(
    deterministicA,
  ) ===
    JSON.stringify(
      deterministicB,
    ),
  "Retrieval quality decisions must be deterministic.",
);

console.log(
  "007.MEMORY deterministic retrieval quality: SUCCESS",
);

console.log(
  "MEMORY-HEALTH-007 RETRIEVAL QUALITY AUTHORITY: SUCCESS",
);
