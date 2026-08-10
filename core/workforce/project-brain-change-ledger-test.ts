import {
  ProjectBrainChangeLedger,
} from "./project-brain-change-ledger";

import type {
  ProjectBrainStateDelta,
} from "./project-brain-state-delta";

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

function createDelta(): ProjectBrainStateDelta {
  return {
    missionId:
      "MISSION-017-TEST",

    previousCreatedAt:
      "2026-08-10T01:00:00.000Z",

    currentCreatedAt:
      "2026-08-10T02:00:00.000Z",

    changed:
      true,

    changes: [
      {
        type:
          "changed",
        category:
          "state",
        id:
          "MISSION-017-TEST",
        summary:
          "Mission execution state changed.",
      },
      {
        type:
          "added",
        category:
          "decision",
        id:
          "DECISION-017-TEST",
        summary:
          'Mission decision "DECISION-017-TEST" was added.',
      },
    ],
  };
}

function main(): void {
  const ledger =
    new ProjectBrainChangeLedger();

  const delta =
    createDelta();

  const event =
    ledger.register(
      delta,
    );

  assert(
    event.missionId ===
      delta.missionId,
    "Mission identity must be preserved.",
  );

  assert(
    event.changes.length ===
      delta.changes.length,
    "All delta changes must be preserved.",
  );

  assert(
    event.previousStateCreatedAt ===
      delta.previousCreatedAt,
    "Previous state provenance must be preserved.",
  );

  assert(
    event.currentStateCreatedAt ===
      delta.currentCreatedAt,
    "Current state provenance must be preserved.",
  );

  console.log(
    "Change event registration: SUCCESS",
  );

  const retrieved =
    ledger.get(
      event.id,
    );

  assert(
    retrieved !==
      undefined,
    "Registered change event must be retrievable.",
  );

  assert(
    retrieved?.id ===
      event.id,
    "Retrieved event identity must be preserved.",
  );

  console.log(
    "Change event retrieval: SUCCESS",
  );

  const missionEvents =
    ledger.list(
      delta.missionId,
    );

  assert(
    missionEvents.length ===
      1,
    "Mission change history must be retrievable.",
  );

  console.log(
    "Mission change history retrieval: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    ledger.register(
      delta,
    );
  } catch {
    duplicateRejected =
      true;
  }

  assert(
    duplicateRejected,
    "Duplicate change events must be rejected.",
  );

  console.log(
    "Duplicate change protection: SUCCESS",
  );

  let unchangedRejected =
    false;

  try {
    ledger.register({
      ...delta,
      changed:
        false,
      changes: [],
      currentCreatedAt:
        "2026-08-10T03:00:00.000Z",
    });
  } catch {
    unchangedRejected =
      true;
  }

  assert(
    unchangedRejected,
    "Unchanged deltas must not enter the change ledger.",
  );

  console.log(
    "Unchanged delta rejection: SUCCESS",
  );

  let emptyChangeRejected =
    false;

  try {
    ledger.register({
      ...delta,
      currentCreatedAt:
        "2026-08-10T04:00:00.000Z",
      changes: [],
    });
  } catch {
    emptyChangeRejected =
      true;
  }

  assert(
    emptyChangeRejected,
    "Empty changed deltas must be rejected.",
  );

  console.log(
    "Empty change protection: SUCCESS",
  );

  const otherMission =
    ledger.list(
      "MISSION-NOT-FOUND",
    );

  assert(
    otherMission.length ===
      0,
    "Mission history must remain scoped to the requested mission.",
  );

  console.log(
    "Mission change isolation: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-017 Project Brain change ledger: SUCCESS",
  );
}

main();
