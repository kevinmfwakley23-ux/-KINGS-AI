import type {
  MissionCheckpoint,
  MissionState,
} from "./mission-continuity";

import {
  MissionContinuityStore,
} from "./mission-continuity";

import {
  ProjectBrainCheckpointAdapter,
} from "./project-brain-checkpoint";

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
  const continuity =
    new MissionContinuityStore();

  const missionId =
    "TREE-05-4-CHECKPOINT-MISSION";

  const planId =
    "TREE-05-4-CHECKPOINT-PLAN";

  continuity.registerMission({
    id:
      missionId,
    name:
      "TREE 05.4 Checkpoint Adapter",
    description:
      "Project Brain checkpoint adapter test.",
    status:
      "active",
    objectives: [
      "Validate checkpoint authority delegation.",
    ],
    sourceReferences: [],
    createdAt:
      "2026-08-12T12:00:00.000Z",
    updatedAt:
      "2026-08-12T12:00:00.000Z",
  });

  continuity.registerPlan({
    id:
      planId,
    missionId,
    version: 1,
    objective:
      "Validate checkpoint authority delegation.",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: [
      "Mission state can be checkpointed and restored.",
    ],
    locked: false,
    approvedByHuman: false,
    createdAt:
      "2026-08-12T12:00:00.000Z",
    updatedAt:
      "2026-08-12T12:00:00.000Z",
  });

  const approved =
    continuity.approvePlan(
      missionId,
    );

  assert(
    approved.approvedByHuman === true,
    "Mission plan approval failed.",
  );

  const locked =
    continuity.lockPlan(
      missionId,
    );

  assert(
    locked.locked === true,
    "Mission plan locking failed.",
  );

  const state =
    continuity.updateState(
      missionId,
      {
        activeTaskIds: [
          "TASK-05-4",
        ],
      },
    );

  assert(
    state.activeTaskIds.includes(
      "TASK-05-4",
    ),
    "Mission state update failed.",
  );

  const adapter =
    new ProjectBrainCheckpointAdapter(
      continuity,
    );

  console.log(
    "05.4 checkpoint authority adapter construction: SUCCESS",
  );

  const checkpoint:
    MissionCheckpoint = {
      id:
        "CHECKPOINT-05-4-001",
      missionId,
      planId,
      planVersion: 1,
      state:
        continuity.getState(
          missionId,
        )!,
      summary:
        "Initial Project Brain continuity checkpoint.",
      reason:
        "TREE 05.4 persistence boundary.",
      createdAt:
        "2026-08-12T12:02:00.000Z",
    };

  const created =
    adapter.create(
      checkpoint,
    );

  assert(
    created.id ===
      checkpoint.id &&
      created.missionId ===
        missionId,
    "Adapter did not delegate checkpoint creation correctly.",
  );

  console.log(
    "05.4 checkpoint creation delegation: SUCCESS",
  );

  const fetched =
    adapter.get(
      checkpoint.id,
    );

  assert(
    fetched?.id ===
      checkpoint.id,
    "Adapter did not delegate checkpoint lookup correctly.",
  );

  console.log(
    "05.4 checkpoint lookup delegation: SUCCESS",
  );

  const latest =
    adapter.latest(
      missionId,
    );

  assert(
    latest?.id ===
      checkpoint.id,
    "Adapter did not delegate latest-checkpoint authority correctly.",
  );

  console.log(
    "05.4 latest checkpoint authority delegation: SUCCESS",
  );

  const listed =
    adapter.list({
      missionId,
    });

  assert(
    listed.length === 1 &&
      listed[0].id ===
        checkpoint.id,
    "Adapter did not expose the authoritative checkpoint.",
  );

  console.log(
    "05.4 authoritative checkpoint listing: SUCCESS",
  );

  const zero =
    adapter.list({
      missionId,
      limit: 0,
    });

  assert(
    zero.length === 0,
    "Adapter zero-limit behavior was not respected.",
  );

  console.log(
    "05.4 checkpoint adapter zero-limit safety: SUCCESS",
  );

  const restored =
    adapter.restoreLatest(
      missionId,
    );

  assert(
    restored.lastCheckpointId ===
      checkpoint.id &&
      restored.activeTaskIds.includes(
        "TASK-05-4",
      ),
    "Adapter did not delegate checkpoint restoration correctly.",
  );

  console.log(
    "05.4 checkpoint restoration delegation: SUCCESS",
  );

  assert(
    adapter.latest(
      missionId,
    )?.id ===
      continuity.getLatestCheckpoint(
        missionId,
      )?.id,
    "Project Brain adapter introduced an independent checkpoint authority.",
  );

  console.log(
    "05.4 single checkpoint authority invariant: SUCCESS",
  );

  console.log(
    "TREE-05.4 PROJECT BRAIN CHECKPOINT AUTHORITY ADAPTER: SUCCESS",
  );
}

main();
