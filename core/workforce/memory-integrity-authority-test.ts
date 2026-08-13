import type {
  MemoryReference,
} from "./types";

import {
  MemoryIntegrityAuthority,
} from "./memory-integrity-authority";

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
  overrides:
    Partial<MemoryReference> =
      {},
):
  MemoryReference {
  return {
    id,
    type:
      "semantic",
    summary:
      "Verified memory integrity proof.",
    sourceReferences:
      [
        "source-memory-health-009",
      ],
    missionId:
      "mission-memory-health-009",
    taskId:
      "task-memory-health-009",
    authoritative:
      false,
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T01:00:00.000Z",
    ...overrides,
  };
}

const authority =
  new MemoryIntegrityAuthority();

const valid =
  authority.verify(
    memory(
      "memory-valid",
    ),
    {
      knownMissionIds:
        [
          "mission-memory-health-009",
        ],
      knownTaskIds:
        [
          "task-memory-health-009",
        ],
      knownSourceIds:
        [
          "source-memory-health-009",
        ],
    },
  );

assert(
  valid.status ===
    "valid",
  "Complete verified memory must pass integrity verification.",
);

assert(
  valid.identityValid,
  "Valid memory identity must pass.",
);

assert(
  valid.timestampsValid,
  "Valid timestamps must pass.",
);

assert(
  valid.provenanceValid,
  "Valid provenance must pass.",
);

assert(
  valid.contextValid,
  "Valid mission/task context must pass.",
);

assert(
  valid.authorityValid,
  "Valid authority state must pass.",
);

console.log(
  "009.MEMORY complete integrity verification: SUCCESS",
);

const missingProvenance =
  authority.verify(
    memory(
      "memory-missing-provenance",
      {
        sourceReferences:
          [],
      },
    ),
  );

assert(
  missingProvenance.status ===
    "invalid",
  "Memory without provenance must fail integrity verification.",
);

assert(
  !missingProvenance.provenanceValid,
  "Missing provenance must be explicitly detected.",
);

console.log(
  "009.MEMORY provenance integrity protection: SUCCESS",
);

const invalidTimestamp =
  authority.verify(
    memory(
      "memory-invalid-timestamp",
      {
        createdAt:
          "2026-08-14T00:00:00.000Z",
        updatedAt:
          "2026-08-13T00:00:00.000Z",
      },
    ),
  );

assert(
  invalidTimestamp.status ===
    "invalid",
  "Memory whose updatedAt precedes createdAt must fail.",
);

assert(
  !invalidTimestamp.timestampsValid,
  "Invalid timestamp ordering must be detected.",
);

console.log(
  "009.MEMORY timestamp integrity protection: SUCCESS",
);

const unknownSource =
  authority.verify(
    memory(
      "memory-unknown-source",
    ),
    {
      knownSourceIds:
        [
          "known-source",
        ],
    },
  );

assert(
  unknownSource.status ===
    "invalid",
  "Unknown provenance references must fail verification.",
);

assert(
  !unknownSource.provenanceValid,
  "Unknown provenance must be explicitly detected.",
);

console.log(
  "009.MEMORY provenance-reference integrity protection: SUCCESS",
);

const unknownMission =
  authority.verify(
    memory(
      "memory-unknown-mission",
      {
        missionId:
          "missing-mission",
      },
    ),
    {
      knownMissionIds:
        [
          "known-mission",
        ],
    },
  );

assert(
  unknownMission.status ===
    "invalid",
  "Unknown mission binding must fail verification.",
);

console.log(
  "009.MEMORY mission-context integrity protection: SUCCESS",
);

const unknownTask =
  authority.verify(
    memory(
      "memory-unknown-task",
      {
        taskId:
          "missing-task",
      },
    ),
    {
      knownTaskIds:
        [
          "known-task",
        ],
    },
  );

assert(
  unknownTask.status ===
    "invalid",
  "Unknown task binding must fail verification.",
);

console.log(
  "009.MEMORY task-context integrity protection: SUCCESS",
);

const inconsistentAuthority =
  authority.verify(
    memory(
      "memory-authoritative-superseded",
      {
        authoritative:
          true,
      },
    ),
    {
      supersededMemoryIds:
        [
          "memory-authoritative-superseded",
        ],
    },
  );

assert(
  inconsistentAuthority.status ===
    "invalid",
  "Authoritative memory marked superseded must fail integrity verification.",
);

assert(
  !inconsistentAuthority.authorityValid,
  "Authority/supersession inconsistency must be detected.",
);

console.log(
  "009.MEMORY authority-supersession integrity protection: SUCCESS",
);

const malformedIdentity =
  authority.verify(
    memory(
      "",
    ),
  );

assert(
  malformedIdentity.status ===
    "invalid",
  "Missing memory identity must fail integrity verification.",
);

console.log(
  "009.MEMORY identity integrity protection: SUCCESS",
);

const deterministicA =
  authority.verify(
    validMemory(),
    {
      knownMissionIds:
        [
          "mission-memory-health-009",
        ],
      knownTaskIds:
        [
          "task-memory-health-009",
        ],
      knownSourceIds:
        [
          "source-memory-health-009",
        ],
    },
  );

const deterministicB =
  authority.verify(
    validMemory(),
    {
      knownMissionIds:
        [
          "mission-memory-health-009",
        ],
      knownTaskIds:
        [
          "task-memory-health-009",
        ],
      knownSourceIds:
        [
          "source-memory-health-009",
        ],
    },
  );

assert(
  JSON.stringify(
    deterministicA,
  ) ===
    JSON.stringify(
      deterministicB,
    ),
  "Memory integrity verification must be deterministic.",
);

console.log(
  "009.MEMORY deterministic integrity verification: SUCCESS",
);

function validMemory():
  MemoryReference {
  return memory(
    "memory-deterministic",
  );
}

console.log(
  "MEMORY-HEALTH-009 INTEGRITY & PROVENANCE VERIFICATION: SUCCESS",
);
