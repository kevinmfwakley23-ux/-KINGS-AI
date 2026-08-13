import type {
  MemoryReference,
  MemoryType,
} from "./types";

import {
  MemoryLifecycleAuthority,
} from "./memory-lifecycle-authority";

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

function createMemory(
  id: string,
  type: MemoryType,
  authoritative = false,
): MemoryReference {
  return {
    id,
    type,
    summary:
      `Memory lifecycle test for ${id}`,
    sourceReferences:
      [`source-${id}`],
    missionId:
      "MISSION-MEMORY-HEALTH-001",
    taskId:
      "TASK-MEMORY-HEALTH-001",
    authoritative,
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T00:00:00.000Z",
  };
}

const authority =
  new MemoryLifecycleAuthority();

const semantic =
  authority.classify(
    createMemory(
      "memory-semantic",
      "semantic",
    ),
  );

assert(
  semantic.lifecycle ===
    "durable",
  "Semantic memory must be durable.",
);

assert(
  semantic.retention ===
    "durable",
  "Semantic memory must use durable retention.",
);

assert(
  semantic.retrieval ===
    "durable-search",
  "Semantic memory must use durable retrieval.",
);

console.log(
  "001.MEMORY semantic lifecycle classification: SUCCESS",
);

const procedural =
  authority.classify(
    createMemory(
      "memory-procedural",
      "procedural",
    ),
  );

assert(
  procedural.lifecycle ===
    "durable",
  "Procedural memory must be durable.",
);

assert(
  procedural.promotion ===
    "verification-required",
  "Procedural memory must require verification before promotion.",
);

console.log(
  "001.MEMORY procedural lifecycle classification: SUCCESS",
);

const working =
  authority.classify(
    createMemory(
      "memory-working",
      "working",
    ),
  );

assert(
  working.lifecycle ===
    "working",
  "Working memory must remain in the working lifecycle.",
);

assert(
  working.retention ===
    "active",
  "Working memory must use active retention.",
);

assert(
  working.retrieval ===
    "active-first",
  "Working memory must use active-first retrieval.",
);

assert(
  working.promotion ===
    "never",
  "Working memory must never be automatically promoted.",
);

console.log(
  "001.MEMORY working lifecycle classification: SUCCESS",
);

const episodic =
  authority.classify(
    createMemory(
      "memory-episodic",
      "episodic",
    ),
  );

assert(
  episodic.lifecycle ===
    "durable",
  "Episodic memory must remain durably retained.",
);

assert(
  episodic.promotion ===
    "verification-required",
  "Episodic memory must not become authoritative without verification.",
);

console.log(
  "001.MEMORY episodic lifecycle classification: SUCCESS",
);

const authoritative =
  authority.classify(
    createMemory(
      "memory-authoritative",
      "semantic",
      true,
    ),
  );

assert(
  authoritative.authoritative,
  "Authoritative memory flag must be preserved.",
);

assert(
  authoritative.lifecycle !==
    "working",
  "Authoritative memory must never be working-only.",
);

console.log(
  "001.MEMORY authoritative-state protection: SUCCESS",
);

let malformedRejected =
  false;

try {
  authority.classify({
    ...createMemory(
      "",
      "semantic",
    ),
  });
} catch (error) {
  malformedRejected =
    error instanceof Error &&
    error.message.includes(
      "memory id is required",
    );
}

assert(
  malformedRejected,
  "Missing memory identity must be rejected.",
);

console.log(
  "001.MEMORY identity validation: SUCCESS",
);

let unsupportedRejected =
  false;

try {
  authority.policyFor(
    "unsupported-memory-type" as MemoryType,
  );
} catch (error) {
  unsupportedRejected =
    error instanceof Error &&
    error.message.includes(
      "unsupported memory type",
    );
}

assert(
  unsupportedRejected,
  "Unsupported memory lifecycle types must be rejected.",
);

console.log(
  "001.MEMORY unsupported-type protection: SUCCESS",
);

const repeatedA =
  authority.classify(
    createMemory(
      "memory-deterministic",
      "semantic",
    ),
  );

const repeatedB =
  authority.classify(
    createMemory(
      "memory-deterministic",
      "semantic",
    ),
  );

assert(
  JSON.stringify(repeatedA) ===
    JSON.stringify(repeatedB),
  "Repeated lifecycle classification must be deterministic.",
);

console.log(
  "001.MEMORY deterministic classification: SUCCESS",
);

console.log(
  "MEMORY-HEALTH-001 LIFECYCLE & CLASSIFICATION AUTHORITY: SUCCESS",
);
