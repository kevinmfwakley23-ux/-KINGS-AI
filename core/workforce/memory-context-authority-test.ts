import type {
  MemoryReference,
} from "./types";

import {
  MemoryContextAuthority,
} from "./memory-context-authority";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function createMemory(
  overrides:
    Partial<MemoryReference> = {},
):
  MemoryReference {
  return {
    id:
      "memory-context-proof",
    type:
      "semantic",
    summary:
      "Contextual memory proof",
    sourceReferences: [
      "evidence-context-proof",
    ],
    missionId:
      "mission-context-proof",
    taskId:
      "task-context-proof",
    authoritative:
      false,
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T00:00:01.000Z",
    ...overrides,
  };
}

const authority =
  new MemoryContextAuthority();

const contextual =
  authority.inspect(
    createMemory(),
  );

assert(
  contextual.memoryId ===
    "memory-context-proof",
  "Memory identity must be preserved.",
);

assert(
  contextual.missionId ===
    "mission-context-proof",
  "Mission identity must be preserved.",
);

assert(
  contextual.taskId ===
    "task-context-proof",
  "Task identity must be preserved.",
);

assert(
  contextual.hasMissionContext,
  "Mission context must be recognized.",
);

assert(
  contextual.hasTaskContext,
  "Task context must be recognized.",
);

assert(
  contextual.hasProvenance,
  "Provenance must be recognized.",
);

console.log(
  "002.MEMORY contextual identity preservation: SUCCESS",
);

const portable =
  createMemory({
    missionId:
      undefined,
    taskId:
      undefined,
  });

const portableInspection =
  authority.inspect(
    portable,
  );

assert(
  authority.isProjectPortable(
    portable,
  ),
  "A memory without mission/task binding must be project-portable.",
);

assert(
  !portableInspection.hasMissionContext,
  "Portable memory must not claim mission context.",
);

assert(
  !portableInspection.hasTaskContext,
  "Portable memory must not claim task context.",
);

console.log(
  "002.MEMORY project-portable context classification: SUCCESS",
);

assert(
  authority.isContextSpecific(
    createMemory(),
  ),
  "Mission/task-bound memory must be context-specific.",
);

console.log(
  "002.MEMORY context-specific classification: SUCCESS",
);

const authoritative =
  authority.inspect(
    createMemory({
      authoritative:
        true,
    }),
  );

assert(
  authoritative.authoritative,
  "Authoritative state must survive context inspection.",
);

assert(
  authoritative.hasProvenance,
  "Authoritative memory must retain provenance.",
);

console.log(
  "002.MEMORY authoritative provenance preservation: SUCCESS",
);

let missingIdRejected =
  false;

try {
  authority.inspect(
    createMemory({
      id:
        "",
    }),
  );
} catch (error) {
  missingIdRejected =
    error instanceof Error &&
    error.message.includes(
      "memory id is required",
    );
}

assert(
  missingIdRejected,
  "Missing memory identity must be rejected.",
);

console.log(
  "002.MEMORY identity validation: SUCCESS",
);

let missingTimestampRejected =
  false;

try {
  authority.inspect(
    createMemory({
      createdAt:
        "",
    }),
  );
} catch (error) {
  missingTimestampRejected =
    error instanceof Error &&
    error.message.includes(
      "requires createdAt",
    );
}

assert(
  missingTimestampRejected,
  "Missing creation timestamp must be rejected.",
);

console.log(
  "002.MEMORY temporal identity validation: SUCCESS",
);

let missingProvenanceRejected =
  false;

try {
  authority.inspect(
    createMemory({
      sourceReferences: [],
    }),
  );
} catch (error) {
  missingProvenanceRejected =
    error instanceof Error &&
    error.message.includes(
      "requires provenance",
    );
}

assert(
  missingProvenanceRejected,
  "Memory without provenance must be rejected.",
);

console.log(
  "002.MEMORY provenance validation: SUCCESS",
);

const first =
  authority.inspect(
    createMemory(),
  );

const second =
  authority.inspect(
    createMemory(),
  );

assert(
  JSON.stringify(first) ===
    JSON.stringify(second),
  "Context inspection must be deterministic.",
);

console.log(
  "002.MEMORY deterministic context inspection: SUCCESS",
);

console.log(
  "MEMORY-HEALTH-002 CONTEXTUAL MEMORY IDENTITY AUTHORITY: SUCCESS",
);
