import type {
  KnowledgeRecord,
} from "./types";

import {
  ProjectBrainStateDeltaAuthority,
} from "./project-brain-state-delta";

import type {
  ProjectBrainStateSnapshot,
} from "./project-brain-state";

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

function createSnapshot(
  suffix: string,
): ProjectBrainStateSnapshot {
  const now =
    new Date().toISOString();

  const record: KnowledgeRecord = {
    id:
      `KNOWLEDGE-016-${suffix}`,
    sourceId:
      `SOURCE-016-${suffix}`,
    memoryType:
      "semantic",
    summary:
      `Authoritative knowledge ${suffix}`,
    content:
      `Project Brain content ${suffix}`,
    evidenceIds: [
      `EVIDENCE-016-${suffix}`,
    ],
    authoritative:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };

  return {
    missionId:
      "MISSION-016-TEST",

    continuity: {
      mission: {
        id:
          "MISSION-016-TEST",
        name:
          "Delta Test Mission",
        description:
          "Tests Project Brain state deltas.",
        status:
          "active",
        objectives: [
          "Detect authoritative state changes.",
        ],
        sourceReferences: [
          "test/016",
        ],
        createdAt:
          now,
        updatedAt:
          now,
      },

      plan: {
        id:
          `PLAN-016-${suffix}`,
        missionId:
          "MISSION-016-TEST",
        version:
          suffix === "A" ? 1 : 2,
        objective:
          `Plan ${suffix}`,
        milestones: [],
        decisionIds: [],
        acceptanceCriteria: [
          "Detect changes.",
        ],
        locked:
          true,
        approvedByHuman:
          true,
        createdAt:
          now,
        updatedAt:
          now,
      },

      state: {
        missionId:
          "MISSION-016-TEST",
        activeTaskIds:
          suffix === "A"
            ? ["TASK-A"]
            : ["TASK-B"],
        completedTaskIds: [],
        blockedTaskIds: [],
        failedTaskIds: [],
        openQuestionIds: [],
        riskIds: [],
        artifactIds: [],
        evidenceIds: [],
        updatedAt:
          now,
      },

      decisions: [
        {
          id:
            `DECISION-016-${suffix}`,
          missionId:
            "MISSION-016-TEST",
          statement:
            `Decision ${suffix}`,
          rationale:
            "Test decision change.",
          authoritative:
            true,
          locked:
            true,
          sourceReferences: [
            `test/decision-${suffix}`,
          ],
          createdAt:
            now,
          updatedAt:
            now,
        },
      ],

      latestCheckpoint: {
        id:
          `CHECKPOINT-016-${suffix}`,
        missionId:
          "MISSION-016-TEST",
        planId:
          `PLAN-016-${suffix}`,
        planVersion:
          suffix === "A" ? 1 : 2,
        state: {
          missionId:
            "MISSION-016-TEST",
          activeTaskIds: [
            suffix === "A"
              ? "TASK-A"
              : "TASK-B",
          ],
          completedTaskIds: [],
          blockedTaskIds: [],
          failedTaskIds: [],
          openQuestionIds: [],
          riskIds: [],
          artifactIds: [],
          evidenceIds: [],
          updatedAt:
            now,
        },
        summary:
          `Checkpoint ${suffix}`,
        reason:
          "Delta testing.",
        createdAt:
          now,
      },
    },

    knowledge: {
      query:
        "Project Brain delta test",
      records: [
        record,
      ],
      evidence: [],
      sourceIds: [
        record.sourceId,
      ],
      createdAt:
        now,
    },

    authoritativeRecords: [
      record,
    ],

    createdAt:
      now,
  };
}

function main(): void {
  const authority =
    new ProjectBrainStateDeltaAuthority();

  const previous =
    createSnapshot("A");

  const current =
    createSnapshot("B");

  const delta =
    authority.compare(
      previous,
      current,
    );

  assert(
    delta.missionId ===
      previous.missionId,
    "Mission identity must be preserved.",
  );

  assert(
    delta.changed === true,
    "Changed snapshots must be marked as changed.",
  );

  assert(
    delta.changes.some(
      (change) =>
        change.category ===
          "plan" &&
        change.type ===
          "added",
    ),
    "New plan identity must be detected.",
  );

  assert(
    delta.changes.some(
      (change) =>
        change.category ===
          "state" &&
        change.type ===
          "changed",
    ),
    "Mission state changes must be detected.",
  );

  assert(
    delta.changes.some(
      (change) =>
        change.category ===
          "decision" &&
        change.type ===
          "removed",
    ),
    "Removed decisions must be detected.",
  );

  assert(
    delta.changes.some(
      (change) =>
        change.category ===
          "decision" &&
        change.type ===
          "added",
    ),
    "Added decisions must be detected.",
  );

  assert(
    delta.changes.some(
      (change) =>
        change.category ===
          "checkpoint",
    ),
    "Checkpoint changes must be detected.",
  );

  assert(
    delta.changes.some(
      (change) =>
        change.category ===
          "knowledge",
    ),
    "Authoritative knowledge changes must be detected.",
  );

  const unchanged =
    authority.compare(
      previous,
      previous,
    );

  assert(
    unchanged.changed ===
      false,
    "Identical snapshots must produce no change.",
  );

  assert(
    unchanged.changes.length ===
      0,
    "Identical snapshots must produce an empty delta.",
  );

  console.log(
    "Mission identity preservation: SUCCESS",
  );

  console.log(
    "Mission plan change detection: SUCCESS",
  );

  console.log(
    "Mission state change detection: SUCCESS",
  );

  console.log(
    "Mission decision change detection: SUCCESS",
  );

  console.log(
    "Mission checkpoint change detection: SUCCESS",
  );

  console.log(
    "Authoritative knowledge change detection: SUCCESS",
  );

  console.log(
    "Identical-state no-change detection: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-016 Project Brain state delta authority: SUCCESS",
  );
}

main();
