import type {
  MemoryReference,
} from "./types";

import {
  MemorySupersessionAuthority,
} from "./memory-supersession-authority";

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
  updatedAt:
    string,
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
      "mission-memory-health-004",
    taskId:
      "task-memory-health-004",
    authoritative:
      false,
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt,
  };
}

const authority =
  new MemorySupersessionAuthority();

const original =
  memory(
    "memory-requirement-a",
    "The application must use provider A.",
    "2026-08-13T01:00:00.000Z",
  );

const replacement =
  memory(
    "memory-requirement-b",
    "The application must use provider B.",
    "2026-08-13T02:00:00.000Z",
  );

const originalRecord =
  authority.register(
    original,
  );

assert(
  originalRecord.status ===
    "current",
  "Newly registered memory must start as current.",
);

assert(
  originalRecord.preserved,
  "Current memory must be preserved.",
);

console.log(
  "004.MEMORY initial current-state registration: SUCCESS",
);

const replacementRecord =
  authority.register(
    replacement,
  );

assert(
  replacementRecord.status ===
    "current",
  "Replacement memory must begin as current before supersession.",
);

console.log(
  "004.MEMORY successor registration: SUCCESS",
);

const superseded =
  authority.supersede(
    original,
    replacement,
    "Provider B became the approved architecture after verification.",
    "2026-08-13T02:30:00.000Z",
  );

assert(
  superseded.status ===
    "superseded",
  "Superseded memory must no longer be current.",
);

assert(
  superseded.supersededBy ===
    replacement.id,
  "Supersession must point to the replacement memory.",
);

assert(
  superseded.preserved,
  "Superseded memory must remain historically preserved.",
);

assert(
  superseded.reason ===
    "Provider B became the approved architecture after verification.",
  "Supersession reason must be preserved.",
);

console.log(
  "004.MEMORY supersession relationship: SUCCESS",
);

const oldTruth =
  authority.currentTruth(
    original.id,
  );

assert(
  !oldTruth.isCurrent,
  "Superseded memory must not be treated as current truth.",
);

assert(
  oldTruth.reason.includes(
    replacement.id,
  ),
  "Current-truth query must identify the replacement memory.",
);

console.log(
  "004.MEMORY superseded-current-truth protection: SUCCESS",
);

const newTruth =
  authority.currentTruth(
    replacement.id,
  );

assert(
  newTruth.isCurrent,
  "Replacement memory must remain current.",
);

console.log(
  "004.MEMORY replacement-current-truth preservation: SUCCESS",
);

const historical =
  authority.get(
    original.id,
  );

assert(
  historical !==
    undefined,
  "Superseded memory must remain retrievable.",
);

assert(
  historical!.preserved,
  "Historical memory must remain preserved.",
);

console.log(
  "004.MEMORY historical superseded-memory preservation: SUCCESS",
);

let selfSupersessionRejected =
  false;

try {
  authority.supersede(
    replacement,
    replacement,
    "Invalid self-supersession.",
    "2026-08-13T03:00:00.000Z",
  );
} catch (error) {
  selfSupersessionRejected =
    error instanceof Error &&
    error.message.includes(
      "cannot supersede itself",
    );
}

assert(
  selfSupersessionRejected,
  "A memory must not supersede itself.",
);

console.log(
  "004.MEMORY self-supersession protection: SUCCESS",
);

let missingReasonRejected =
  false;

try {
  authority.supersede(
    memory(
      "memory-reason-a",
      "Old rule.",
      "2026-08-13T03:00:00.000Z",
    ),
    memory(
      "memory-reason-b",
      "New rule.",
      "2026-08-13T03:01:00.000Z",
    ),
    "   ",
    "2026-08-13T03:02:00.000Z",
  );
} catch (error) {
  missingReasonRejected =
    error instanceof Error &&
    error.message.includes(
      "reason is required",
    );
}

assert(
  missingReasonRejected,
  "Supersession must require a reason.",
);

console.log(
  "004.MEMORY supersession-reason validation: SUCCESS",
);

let duplicateSupersessionRejected =
  false;

try {
  authority.supersede(
    original,
    replacement,
    "Attempt to supersede the same predecessor again.",
    "2026-08-13T04:00:00.000Z",
  );
} catch (error) {
  duplicateSupersessionRejected =
    error instanceof Error &&
    error.message.includes(
      "already superseded",
    );
}

assert(
  duplicateSupersessionRejected,
  "A superseded memory must not be reassigned to another successor.",
);

console.log(
  "004.MEMORY supersession immutability protection: SUCCESS",
);

const records =
  authority.all();

assert(
  records.length ===
    2,
  "Supersession authority must preserve both predecessor and successor records.",
);

console.log(
  "004.MEMORY supersession history preservation: SUCCESS",
);

console.log(
  "MEMORY-HEALTH-004 SUPERSESSION & CURRENT-TRUTH AUTHORITY: SUCCESS",
);
