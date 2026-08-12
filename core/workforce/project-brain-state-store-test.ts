import type {
  ProjectBrainStateSnapshot,
} from "./project-brain-state";

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

function snapshot(
  missionId: string,
  createdAt: string,
  activeTaskId: string,
): ProjectBrainStateSnapshot {
  return {
    missionId,
    continuity: {
      mission: {
        id: missionId,
        name:
          "TREE 05.4 State Test",
        description:
          "Project Brain state persistence test.",
        status:
          "active",
        objectives: [
          "Persist state.",
        ],
        sourceReferences: [],
        createdAt,
        updatedAt:
          createdAt,
      },
      plan: {
        id:
          `${missionId}-PLAN`,
        missionId,
        version: 1,
        objective:
          "Persist Project Brain state.",
        milestones: [],
        decisionIds: [],
        acceptanceCriteria: [],
        locked: true,
        approvedByHuman: true,
        createdAt,
        updatedAt:
          createdAt,
      },
      state: {
        missionId,
        activeTaskIds: [
          activeTaskId,
        ],
        blockedTaskIds: [],
        completedTaskIds: [],
        failedTaskIds: [],
        openQuestionIds: [],
        riskIds: [],
        artifactIds: [],
        evidenceIds: [],
        updatedAt:
          createdAt,
      },
      decisions: [],
      latestCheckpoint:
        undefined,
    },
    knowledge: {
      query:
        "Project Brain",
      records: [],
      evidence: [],
      sourceIds: [],
      createdAt,
    },
    authoritativeRecords: [],
    createdAt,
  };
}

function main(): void {
  const store =
    new ProjectBrainStateStore();

  const first =
    snapshot(
      "MISSION-054-A",
      "2026-08-12T05:00:00.000Z",
      "TASK-A",
    );

  const second =
    snapshot(
      "MISSION-054-A",
      "2026-08-12T06:00:00.000Z",
      "TASK-B",
    );

  const otherMission =
    snapshot(
      "MISSION-054-B",
      "2026-08-12T05:30:00.000Z",
      "TASK-C",
    );

  const firstRecord =
    store.persist(
      first,
      "2026-08-12T06:01:00.000Z",
    );

  assert(
    firstRecord.missionId ===
      "MISSION-054-A",
    "Persisted snapshot did not preserve mission identity.",
  );

  console.log(
    "05.4 state snapshot identity: SUCCESS",
  );

  assert(
    firstRecord.snapshotHash.length >
      0,
    "Persisted snapshot did not receive an integrity hash.",
  );

  console.log(
    "05.4 state snapshot integrity identity: SUCCESS",
  );

  const secondRecord =
    store.persist(
      second,
      "2026-08-12T07:01:00.000Z",
    );

  store.persist(
    otherMission,
    "2026-08-12T06:31:00.000Z",
  );

  assert(
    store.list().length === 3,
    "State store did not preserve all persisted snapshots.",
  );

  console.log(
    "05.4 state snapshot registration: SUCCESS",
  );

  const fetched =
    store.get(
      firstRecord.id,
    );

  assert(
    fetched?.snapshot.missionId ===
      "MISSION-054-A",
    "State snapshot lookup failed.",
  );

  console.log(
    "05.4 state snapshot lookup: SUCCESS",
  );

  const restored =
    store.restore(
      firstRecord.id,
    );

  assert(
    restored.missionId ===
      first.missionId &&
      restored.createdAt ===
        first.createdAt &&
      restored.continuity.state
        .activeTaskIds[0] ===
        "TASK-A",
    "State snapshot restoration failed.",
  );

  console.log(
    "05.4 state snapshot restoration: SUCCESS",
  );

  restored.continuity.state
    .activeTaskIds.push(
      "MUTATION-ATTEMPT",
    );

  const restoredAgain =
    store.restore(
      firstRecord.id,
    );

  assert(
    !restoredAgain
      .continuity.state
      .activeTaskIds
      .includes(
        "MUTATION-ATTEMPT",
      ),
    "Restored state leaked mutable internal storage.",
  );

  console.log(
    "05.4 restored-state isolation: SUCCESS",
  );

  const missionRecords =
    store.list({
      missionId:
        "MISSION-054-A",
    });

  assert(
    missionRecords.length === 2,
    "Mission-scoped state retrieval returned the wrong records.",
  );

  console.log(
    "05.4 mission state isolation: SUCCESS",
  );

  const limited =
    store.list({
      missionId:
        "MISSION-054-A",
      limit: 1,
    });

  assert(
    limited.length === 1,
    "State snapshot lookup limit was not enforced.",
  );

  console.log(
    "05.4 state lookup limit: SUCCESS",
  );

  const zero =
    store.list({
      missionId:
        "MISSION-054-A",
      limit: 0,
    });

  assert(
    zero.length === 0,
    "Explicit zero state lookup limit was not respected.",
  );

  console.log(
    "05.4 state zero-limit safety: SUCCESS",
  );

  const deterministicA =
    store.list();

  const deterministicB =
    store.list();

  assert(
    JSON.stringify(
      deterministicA,
    ) ===
      JSON.stringify(
        deterministicB,
      ),
    "Repeated state listing was not deterministic.",
  );

  console.log(
    "05.4 deterministic state listing: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    store.persist(
      first,
      "2026-08-12T06:01:00.000Z",
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
    "Duplicate state snapshot was not rejected.",
  );

  console.log(
    "05.4 duplicate snapshot protection: SUCCESS",
  );

  let unknownRejected =
    false;

  try {
    store.restore(
      "missing-state-snapshot",
    );
  } catch (error) {
    unknownRejected =
      error instanceof Error &&
      error.message.includes(
        "unknown snapshot",
      );
  }

  assert(
    unknownRejected,
    "Unknown state snapshot was not rejected.",
  );

  console.log(
    "05.4 unknown snapshot rejection: SUCCESS",
  );

  store.clear();

  assert(
    store.list().length === 0,
    "State store clear did not remove persisted snapshots.",
  );

  console.log(
    "05.4 state store clear integrity: SUCCESS",
  );

  console.log(
    "TREE-05.4 PROJECT BRAIN STATE PERSISTENCE: SUCCESS",
  );
}

main();
