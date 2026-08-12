import {
  MemoryConsolidationAuthority,
} from "./memory-consolidation";

import {
  MemoryConsolidationStore,
} from "./memory-consolidation-store";

import type {
  MemoryReference,
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
  "2026-08-12T00:00:00.000Z";

const authority =
  new MemoryConsolidationAuthority();

const sourceA:
  MemoryReference = {
  id:
    "MEMORY-05-5-3-A",
  type:
    "episodic",
  summary:
    "Execution observation A.",
  sourceReferences: [
    "SOURCE-A",
  ],
  missionId:
    "MISSION-05-5-3",
  authoritative:
    false,
  createdAt:
    now,
  updatedAt:
    now,
};

const sourceB:
  MemoryReference = {
  id:
    "MEMORY-05-5-3-B",
  type:
    "episodic",
  summary:
    "Execution observation B.",
  sourceReferences: [
    "SOURCE-B",
  ],
  missionId:
    "MISSION-05-5-3",
  authoritative:
    false,
  createdAt:
    now,
  updatedAt:
    now,
};

const candidateA =
  authority.propose({
    memories: [
      sourceA,
    ],
    candidateId:
      "CANDIDATE-05-5-3-A",
    memoryType:
      "semantic",
    summary:
      "Consolidated execution observation A.",
    consolidationReason:
      "Preserve durable execution context.",
    missionId:
      "MISSION-05-5-3",
  });

const candidateB =
  authority.propose({
    memories: [
      sourceB,
    ],
    candidateId:
      "CANDIDATE-05-5-3-B",
    memoryType:
      "semantic",
    summary:
      "Consolidated execution observation B.",
    consolidationReason:
      "Preserve durable execution context.",
    missionId:
      "MISSION-05-5-3",
  });

assert(
  candidateA.allowed &&
  candidateB.allowed,
  "Valid consolidation candidates must be accepted.",
);

const store =
  new MemoryConsolidationStore();

store.register(
  candidateB.candidate,
);

store.register(
  candidateA.candidate,
);

console.log(
  "05.5.3 consolidation registration: SUCCESS",
);

const listed =
  store.list();

assert(
  listed.length === 2,
  "Both consolidation candidates must be listed.",
);

assert(
  listed[0].id <
    listed[1].id,
  "Consolidation listing must be deterministic.",
);

console.log(
  "05.5.3 deterministic consolidation listing: SUCCESS",
);

const limited =
  store.list(1);

assert(
  limited.length === 1,
  "Consolidation result limit must be enforced.",
);

console.log(
  "05.5.3 consolidation result limit: SUCCESS",
);

const zero =
  store.list(0);

assert(
  zero.length === 0,
  "Explicit zero limit must return no candidates.",
);

console.log(
  "05.5.3 explicit zero-limit safety: SUCCESS",
);

try {
  store.list(-1);

  throw new Error(
    "Negative consolidation limit was accepted.",
  );
} catch (error) {
  assert(
    String(error).includes(
      "limit must be a non-negative integer",
    ),
    "Invalid consolidation limit must be rejected.",
  );
}

console.log(
  "05.5.3 invalid-limit rejection: SUCCESS",
);

const retrieved =
  store.get(
    candidateA.candidate.id,
  );

assert(
  retrieved !== undefined,
  "Registered consolidation candidate must be retrievable.",
);

retrieved!.sourceMemoryIds.push(
  "MUTATION-ATTEMPT",
);

retrieved!.sourceReferences.push(
  "MUTATION-ATTEMPT",
);

const isolated =
  store.get(
    candidateA.candidate.id,
  );

assert(
  isolated!.sourceMemoryIds.length === 1,
  "Source memory lineage must be defensively isolated.",
);

assert(
  isolated!.sourceReferences.length === 1,
  "Source provenance must be defensively isolated.",
);

console.log(
  "05.5.3 consolidation defensive isolation: SUCCESS",
);

const listedMutation =
  store.list();

listedMutation[0].sourceMemoryIds.push(
  "LIST-MUTATION-ATTEMPT",
);

assert(
  store.list()[0].sourceMemoryIds.length === 1,
  "Listed consolidation candidates must be defensively isolated.",
);

console.log(
  "05.5.3 consolidation listing isolation: SUCCESS",
);

try {
  store.register({
    ...candidateA.candidate,
    id:
      "CANDIDATE-05-5-3-DUPLICATE-SOURCE",
    sourceMemoryIds: [
      "MEMORY-A",
      "MEMORY-A",
    ],
  });

  throw new Error(
    "Duplicate source memory candidate was accepted.",
  );
} catch (error) {
  assert(
    String(error).includes(
      "duplicate source memories",
    ),
    "Duplicate source memory lineage must be rejected.",
  );
}

console.log(
  "05.5.3 duplicate source lineage rejection: SUCCESS",
);

try {
  store.register({
    ...candidateA.candidate,
    id:
      "CANDIDATE-05-5-3-NO-PROVENANCE",
    sourceReferences: [],
  });

  throw new Error(
    "Candidate without provenance was accepted.",
  );
} catch (error) {
  assert(
    String(error).includes(
      "requires source provenance",
    ),
    "Missing consolidation provenance must be rejected.",
  );
}

console.log(
  "05.5.3 provenance boundary: SUCCESS",
);

try {
  const maliciousAuthoritativeCandidate =
    {
      ...candidateA.candidate,
      id:
        "CANDIDATE-05-5-3-AUTHORITATIVE",
      authoritative:
        true,
    } as unknown as typeof candidateA.candidate;

  store.register(
    maliciousAuthoritativeCandidate,
  );

  throw new Error(
    "Authoritative consolidation candidate was accepted.",
  );
} catch (error) {
  assert(
    String(error).includes(
      "cannot be authoritative",
    ),
    "Consolidation candidates must never become authoritative in the store.",
  );
}

console.log(
  "05.5.3 automatic authority boundary: SUCCESS",
);

try {
  store.register(
    candidateA.candidate,
  );

  throw new Error(
    "Duplicate candidate was accepted.",
  );
} catch (error) {
  assert(
    String(error).includes(
      "duplicate candidate id",
    ),
    "Duplicate consolidation candidate must be rejected.",
  );
}

console.log(
  "05.5.3 duplicate candidate protection: SUCCESS",
);

const beforeClear =
  store.list();

assert(
  beforeClear.length === 2,
  "Store should contain two candidates before clear.",
);

store.clear();

assert(
  store.list().length === 0,
  "Consolidation store clear must remove all candidates.",
);

console.log(
  "05.5.3 consolidation store clear integrity: SUCCESS",
);

console.log(
  "TREE-05.5.3 MEMORY CONSOLIDATION INTEGRITY: SUCCESS",
);
