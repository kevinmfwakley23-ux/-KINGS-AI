import type {
  ProjectBrainStateSnapshot,
} from "./project-brain-state";

import {
  ProjectBrainStateAuthority,
} from "./project-brain-state";

import {
  ProjectBrain,
} from "./project-brain";

import {
  MissionContinuityStore,
} from "./mission-continuity";

import {
  ProjectBrainStatePersistence,
} from "./project-brain-state-persistence";

import {
  ProjectBrainStateStore,
} from "./project-brain-state-store";

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

function main(): void {
  /*
   * The existing ProjectBrainStateAuthority is the authoritative
   * state assembler. This bridge must not recreate state itself.
   *
   * The test discovers the existing authority constructor contract
   * through the compiled project rather than duplicating its logic.
   */

  const brain =
    new ProjectBrain();

  const continuity =
    new MissionContinuityStore();

  const authority =
    new ProjectBrainStateAuthority(
      brain,
      continuity,
    );

  const store =
    new ProjectBrainStateStore();

  const persistence =
    new ProjectBrainStatePersistence(
      authority,
      store,
    );

  console.log(
    "05.4 state authority bridge construction: SUCCESS",
  );

  /*
   * Validate that the persistence layer accepts an authoritative
   * snapshot and returns the exact durable record produced by the
   * state store.
   *
   * The snapshot is intentionally typed through the existing
   * ProjectBrainStateSnapshot contract.
   */
  const syntheticSnapshot =
    {
      missionId:
        "TREE-05-4-BRIDGE-MISSION",
      continuity:
        {} as ProjectBrainStateSnapshot[
          "continuity"
        ],
      knowledge:
        {
          query:
            "Project Brain",
          records: [],
          evidence: [],
          sourceIds: [],
          createdAt:
            "2026-08-12T08:00:00.000Z",
        },
      authoritativeRecords: [],
      createdAt:
        "2026-08-12T08:00:00.000Z",
    } satisfies ProjectBrainStateSnapshot;

  const persisted =
    persistence.persistSnapshot(
      syntheticSnapshot,
      "2026-08-12T08:01:00.000Z",
    );

  assert(
    persisted.missionId ===
      "TREE-05-4-BRIDGE-MISSION",
    "Persistence bridge did not preserve mission identity.",
  );

  console.log(
    "05.4 persistence bridge mission identity: SUCCESS",
  );

  assert(
    persisted.snapshot.createdAt ===
      syntheticSnapshot.createdAt,
    "Persistence bridge did not preserve authoritative snapshot.",
  );

  console.log(
    "05.4 authoritative snapshot preservation: SUCCESS",
  );

  const restored =
    persistence.restore(
      persisted.id,
    );

  assert(
    restored.missionId ===
      syntheticSnapshot.missionId &&
      restored.createdAt ===
        syntheticSnapshot.createdAt,
    "Persistence bridge restoration failed.",
  );

  console.log(
    "05.4 persistence bridge restoration: SUCCESS",
  );

  const latest =
    persistence.latest(
      "TREE-05-4-BRIDGE-MISSION",
    );

  assert(
    latest?.id ===
      persisted.id,
    "Persistence bridge latest-state lookup failed.",
  );

  console.log(
    "05.4 latest-state bridge lookup: SUCCESS",
  );

  const listed =
    persistence.list({
      missionId:
        "TREE-05-4-BRIDGE-MISSION",
    });

  assert(
    listed.length === 1 &&
      listed[0].id ===
        persisted.id,
    "Persistence bridge mission-scoped listing failed.",
  );

  console.log(
    "05.4 mission-scoped persistence listing: SUCCESS",
  );

  const repeatedA =
    persistence.list();

  const repeatedB =
    persistence.list();

  assert(
    JSON.stringify(
      repeatedA,
    ) ===
      JSON.stringify(
        repeatedB,
      ),
    "Persistence bridge listing was not deterministic.",
  );

  console.log(
    "05.4 persistence bridge determinism: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    persistence.persistSnapshot(
      syntheticSnapshot,
      "2026-08-12T08:01:00.000Z",
    );
  } catch (error) {
    duplicateRejected =
      error instanceof Error &&
      error.message.includes(
        "duplicate snapshot",
      );
  }

  assert(
    duplicateRejected,
    "Persistence bridge did not preserve duplicate protection.",
  );

  console.log(
    "05.4 persistence bridge duplicate protection: SUCCESS",
  );

  console.log(
    "TREE-05.4 PROJECT BRAIN STATE AUTHORITY BRIDGE: SUCCESS",
  );
}

main();
