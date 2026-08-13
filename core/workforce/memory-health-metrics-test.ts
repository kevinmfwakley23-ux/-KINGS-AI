import type {
  MemoryReference,
} from "./types";

import {
  MemoryHealthMetricsAuthority,
} from "./memory-health-metrics";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
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
      "mission-memory-health-005",
    taskId:
      "task-memory-health-005",
    authoritative:
      false,
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

const authority =
  new MemoryHealthMetricsAuthority();

const important =
  authority.assess(
    memory(
      "memory-important",
      "The active project must preserve verified architectural decisions.",
      {
        authoritative:
          true,
        updatedAt:
          "2026-08-12T12:00:00.000Z",
      },
    ),
    {
      now:
        "2026-08-13T00:00:00.000Z",
      referenceMissionId:
        "mission-memory-health-005",
      referenceTaskId:
        "task-memory-health-005",
      retrievalCount:
        10,
      usefulRetrievalCount:
        9,
      estimatedTokenCost:
        25,
    },
  );

assert(
  important.importance >
    0.75,
  "Highly relevant authoritative and repeatedly useful memory should score highly.",
);

assert(
  important.health ===
    "healthy",
  "High-value verified memory should be healthy.",
);

console.log(
  "005.MEMORY high-value importance scoring: SUCCESS",
);

const lowValue =
  authority.assess(
    memory(
      "memory-low-value",
      "Old low-use observation.",
      {
        missionId:
          "different-mission",
        taskId:
          "different-task",
        updatedAt:
          "2026-01-01T00:00:00.000Z",
      },
    ),
    {
      now:
        "2026-08-13T00:00:00.000Z",
      referenceMissionId:
        "mission-memory-health-005",
      referenceTaskId:
        "task-memory-health-005",
      retrievalCount:
        10,
      usefulRetrievalCount:
        0,
      estimatedTokenCost:
        20,
    },
  );

assert(
  lowValue.importance <
    important.importance,
  "Lower-value memory must rank below important memory.",
);

console.log(
  "005.MEMORY importance comparison: SUCCESS",
);

const heavilyReused =
  authority.assess(
    memory(
      "memory-reused",
      "Frequently reused engineering procedure.",
    ),
    {
      now:
        "2026-08-13T00:00:00.000Z",
      retrievalCount:
        20,
      usefulRetrievalCount:
        19,
      estimatedTokenCost:
        40,
    },
  );

assert(
  heavilyReused.reuse >
    0.90,
  "Frequently useful memory must receive a high reuse score.",
);

console.log(
  "005.MEMORY reuse scoring: SUCCESS",
);

const stale =
  authority.assess(
    memory(
      "memory-stale",
      "Old procedural memory.",
      {
        updatedAt:
          "2025-08-01T00:00:00.000Z",
      },
    ),
    {
      now:
        "2026-08-13T00:00:00.000Z",
      retrievalCount:
        0,
      usefulRetrievalCount:
        0,
    },
  );

assert(
  stale.recency <
    important.recency,
  "Older memory must receive a lower recency score.",
);

console.log(
  "005.MEMORY recency scoring: SUCCESS",
);

const superseded =
  authority.assess(
    memory(
      "memory-superseded",
      "Historical requirement.",
    ),
    {
      now:
        "2026-08-13T00:00:00.000Z",
      superseded:
        true,
      retrievalCount:
        4,
      usefulRetrievalCount:
        1,
    },
  );

assert(
  superseded.supersession ===
    0,
  "Superseded memory must receive zero current-truth supersession score.",
);

assert(
  superseded.health !==
    "healthy",
  "Superseded memory must not be treated as fully healthy current memory.",
);

console.log(
  "005.MEMORY supersession health signal: SUCCESS",
);

const expensive =
  authority.assess(
    memory(
      "memory-expensive",
      "A very large historical memory payload represented by an explicit estimated context cost.",
    ),
    {
      now:
        "2026-08-13T00:00:00.000Z",
      estimatedTokenCost:
        1500,
      retrievalCount:
        2,
      usefulRetrievalCount:
        0,
    },
  );

assert(
  expensive.estimatedContextCost ===
    1500,
  "Explicit context cost must be preserved.",
);

assert(
  expensive.reasons.includes(
    "high context cost",
  ),
  "High context cost must be visible in health reasons.",
);

console.log(
  "005.MEMORY context-cost accounting: SUCCESS",
);

const missingProvenance =
  memory(
    "memory-no-provenance",
    "Memory without evidence.",
    {
      sourceReferences: [],
    },
  );

const unhealthy =
  authority.assess(
    missingProvenance,
    {
      now:
        "2026-08-13T00:00:00.000Z",
    },
  );

assert(
  unhealthy.provenance ===
    0,
  "Missing provenance must produce a zero provenance score.",
);

assert(
  unhealthy.health ===
    "degraded",
  "Missing provenance must degrade memory health.",
);

console.log(
  "005.MEMORY provenance health protection: SUCCESS",
);

const deterministicA =
  authority.assess(
    important ===
      undefined
      ? memory(
          "unused",
          "unused",
        )
      : memory(
          "memory-important",
          "The active project must preserve verified architectural decisions.",
          {
            authoritative:
              true,
            updatedAt:
              "2026-08-12T12:00:00.000Z",
          },
        ),
    {
      now:
        "2026-08-13T00:00:00.000Z",
      referenceMissionId:
        "mission-memory-health-005",
      referenceTaskId:
        "task-memory-health-005",
      retrievalCount:
        10,
      usefulRetrievalCount:
        9,
      estimatedTokenCost:
        25,
    },
  );

const deterministicB =
  authority.assess(
    memory(
      "memory-important",
      "The active project must preserve verified architectural decisions.",
      {
        authoritative:
          true,
        updatedAt:
          "2026-08-12T12:00:00.000Z",
      },
    ),
    {
      now:
        "2026-08-13T00:00:00.000Z",
      referenceMissionId:
        "mission-memory-health-005",
      referenceTaskId:
        "task-memory-health-005",
      retrievalCount:
        10,
      usefulRetrievalCount:
        9,
      estimatedTokenCost:
        25,
    },
  );

assert(
  JSON.stringify(
    deterministicA,
  ) ===
    JSON.stringify(
      deterministicB,
    ),
  "Memory health assessment must be deterministic.",
);

console.log(
  "005.MEMORY deterministic health assessment: SUCCESS",
);

const ranked =
  [
    lowValue,
    important,
    heavilyReused,
  ].sort(
    (
      left,
      right,
    ) =>
      authority.compare(
        left,
        right,
      ),
  );

assert(
  ranked[0].memoryId ===
    important.memoryId,
  "Highest-value memory must rank first.",
);

console.log(
  "005.MEMORY importance ranking: SUCCESS",
);

console.log(
  "MEMORY-HEALTH-005 IMPORTANCE & HEALTH METRICS: SUCCESS",
);
