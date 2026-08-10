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
  new Date().toISOString();

const source:
  MemoryReference = {
  id:
    "memory-013-store-source",
  type:
    "episodic",
  summary:
    "Verified execution observation.",
  sourceReferences: [
    "verification-013",
  ],
  missionId:
    "mission-013",
  authoritative:
    false,
  createdAt:
    now,
  updatedAt:
    now,
};

const authority =
  new MemoryConsolidationAuthority();

const decision =
  authority.propose({
    memories: [
      source,
    ],
    candidateId:
      "candidate-013-store",
    memoryType:
      "semantic",
    summary:
      "Verified execution observation retained as a consolidation candidate.",
    consolidationReason:
      "Preserve a compact representation of verified execution history.",
    missionId:
      "mission-013",
  });

assert(
  decision.allowed,
  "Valid consolidation candidate should be allowed.",
);

const store =
  new MemoryConsolidationStore();

store.register(
  decision.candidate,
);

assert(
  store.get(
    decision.candidate.id,
  ) !== undefined,
  "Registered consolidation candidate should be retrievable.",
);

console.log(
  "Consolidation candidate registration: SUCCESS",
);

assert(
  store.list().length === 1,
  "Consolidation store should list registered candidates.",
);

console.log(
  "Consolidation candidate retrieval: SUCCESS",
);

try {
  store.register(
    decision.candidate,
  );

  throw new Error(
    "Duplicate consolidation candidate was accepted.",
  );
} catch (error) {
  if (
    !String(error).includes(
      "duplicate candidate id",
    )
  ) {
    throw error;
  }
}

console.log(
  "Duplicate consolidation candidate rejection: SUCCESS",
);

try {
  const authoritativeCandidate =
    {
      ...decision.candidate,
      id:
        "candidate-013-authoritative",
    };

  Object.defineProperty(
    authoritativeCandidate,
    "authoritative",
    {
      value: true,
      enumerable: true,
      writable: true,
    },
  );

  store.register(
    authoritativeCandidate,
  );

  throw new Error(
    "Authoritative consolidation candidate was accepted.",
  );
} catch (error) {
  if (
    !String(error).includes(
      "cannot be authoritative",
    )
  ) {
    throw error;
  }
}

console.log(
  "Automatic authority protection: SUCCESS",
);

console.log(
  "INTELLIGENCE-013 consolidation store boundary: SUCCESS",
);
