import type {
  MemoryReference,
} from "./types";

import {
  MemoryConsolidationEfficiencyAuthority,
} from "./memory-consolidation-efficiency";

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
  source:
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
      [source],
    missionId:
      "mission-memory-health-003",
    taskId:
      "task-memory-health-003",
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
  new MemoryConsolidationEfficiencyAuthority();

const single =
  authority.decide([
    memory(
      "memory-one",
      "A verified engineering rule.",
      "source-one",
    ),
  ]);

assert(
  single.decision ===
    "retain",
  "A single memory must not trigger unnecessary consolidation.",
);

assert(
  single.estimatedReduction ===
    0,
  "A single memory must have zero estimated reduction.",
);

console.log(
  "003.MEMORY single-memory retention protection: SUCCESS",
);

const distinctA =
  memory(
    "memory-a",
    "Use explicit return types for public functions.",
    "source-a",
  );

const distinctB =
  memory(
    "memory-b",
    "Use strict compiler settings for generated code.",
    "source-b",
  );

const distinct =
  authority.decide([
    distinctA,
    distinctB,
  ]);

assert(
  distinct.decision ===
    "consolidate",
  "Multiple distinct memories must be eligible for consolidation.",
);

assert(
  distinct.sourceMemoryIds.length ===
    2,
  "Consolidation must preserve source memory lineage.",
);

assert(
  distinct.sourceReferences.length ===
    2,
  "Consolidation must preserve source provenance.",
);

console.log(
  "003.MEMORY distinct-memory consolidation eligibility: SUCCESS",
);

const duplicateA =
  memory(
    "memory-duplicate-a",
    "Use explicit return types for public functions.",
    "source-a",
  );

const duplicateB =
  memory(
    "memory-duplicate-b",
    "  Use   explicit return types for public functions.  ",
    "source-b",
  );

const duplicates =
  authority.decide([
    duplicateA,
    duplicateB,
  ]);

assert(
  duplicates.decision ===
    "consolidate",
  "Duplicate memories must be eligible for consolidation.",
);

assert(
  duplicates.estimatedReduction ===
    1,
  "Duplicate memories should report one reducible memory.",
);

console.log(
  "003.MEMORY duplicate-memory consolidation eligibility: SUCCESS",
);

const deduplicated =
  authority.deduplicate([
    duplicateA,
    duplicateB,
    distinctB,
  ]);

assert(
  deduplicated.length ===
    2,
  "Duplicate memories must collapse to one retained representative.",
);

console.log(
  "003.MEMORY duplicate-memory reduction: SUCCESS",
);

const provenanceMerged =
  authority.decide([
    memory(
      "memory-provenance-a",
      "Same learned engineering rule.",
      "source-one",
    ),
    memory(
      "memory-provenance-b",
      "Same learned engineering rule.",
      "source-two",
    ),
  ]);

assert(
  provenanceMerged.sourceReferences.includes(
    "source-one",
  ),
  "Merged memory provenance must preserve source one.",
);

assert(
  provenanceMerged.sourceReferences.includes(
    "source-two",
  ),
  "Merged memory provenance must preserve source two.",
);

console.log(
  "003.MEMORY merged provenance preservation: SUCCESS",
);

const batches =
  authority.batch(
    [
      distinctA,
      distinctB,
      duplicateA,
      duplicateB,
      memory(
        "memory-five",
        "Another engineering rule.",
        "source-five",
      ),
    ],
    2,
  );

assert(
  batches.length ===
    3,
  "Memory batching must split large input into bounded consolidation groups.",
);

assert(
  batches.every(
    (
      batch,
    ) =>
      batch.memories.length <=
      batch.maxSources,
  ),
  "No consolidation batch may exceed its source limit.",
);

console.log(
  "003.MEMORY bounded consolidation batches: SUCCESS",
);

const deterministicA =
  authority.decide([
    distinctA,
    distinctB,
  ]);

const deterministicB =
  authority.decide([
    distinctA,
    distinctB,
  ]);

assert(
  JSON.stringify(
    deterministicA,
  ) ===
    JSON.stringify(
      deterministicB,
    ),
  "Consolidation eligibility decisions must be deterministic.",
);

console.log(
  "003.MEMORY deterministic consolidation decision: SUCCESS",
);

let missingProvenanceRejected =
  false;

try {
  authority.decide([
    memory(
      "memory-invalid",
      "Invalid memory",
      "source-invalid",
      {
        sourceReferences: [],
      },
    ),
  ]);
} catch (error) {
  missingProvenanceRejected =
    error instanceof Error &&
    error.message.includes(
      "requires provenance",
    );
}

assert(
  missingProvenanceRejected,
  "Memories without provenance must be rejected before consolidation.",
);

console.log(
  "003.MEMORY provenance boundary protection: SUCCESS",
);

console.log(
  "MEMORY-HEALTH-003 CONSOLIDATION EFFICIENCY & DEDUPLICATION: SUCCESS",
);
