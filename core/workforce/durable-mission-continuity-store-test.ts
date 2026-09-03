import {
  mkdtempSync,
  rmSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  DurableMissionContinuityStore,
} from "./durable-mission-continuity-store";

import type {
  Mission,
} from "./types";

import type {
  MissionDecision,
  MissionPlan,
} from "./mission-continuity";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function main(): void {
  const root =
    mkdtempSync(
      join(
        tmpdir(),
        "kings-durable-continuity-",
      ),
    );

  try {
    const stateFile =
      join(
        root,
        ".kings",
        "mission-continuity.json",
      );

    const createdAt =
      "2026-09-02T00:00:00.000Z";

    const mission: Mission = {
      id: "mission-durable-disk",
      name: "Durable disk mission",
      description: "Prove mission continuity survives runtime reconstruction.",
      status: "active",
      objectives: [
        "Persist mission state outside process memory.",
      ],
      sourceReferences: [
        "test://durable-mission-continuity",
      ],
      createdAt,
      updatedAt: createdAt,
    };

    const plan: MissionPlan = {
      id: "plan-durable-disk-v1",
      missionId: mission.id,
      version: 1,
      objective: "Complete two tasks with a restart between them.",
      milestones: [
        {
          id: "milestone-durable-disk",
          missionId: mission.id,
          name: "Restart-safe execution",
          objective: "Preserve completed task state.",
          taskIds: [
            "task-one",
            "task-two",
          ],
          dependencyIds: [],
          status: "active",
        },
      ],
      decisionIds: [
        "decision-durable-disk",
      ],
      acceptanceCriteria: [
        "State can be loaded by a new store instance.",
      ],
      locked: false,
      approvedByHuman: false,
      createdAt,
      updatedAt: createdAt,
    };

    const decision: MissionDecision = {
      id: "decision-durable-disk",
      missionId: mission.id,
      statement: "Mission continuity must be persisted to disk.",
      rationale: "A local owner runtime must survive process restarts.",
      authoritative: true,
      locked: true,
      sourceReferences: [
        "test://durable-mission-continuity",
      ],
      createdAt,
      updatedAt: createdAt,
    };

    const first =
      new DurableMissionContinuityStore(
        stateFile,
      );

    first.registerMission(
      mission,
    );
    first.registerPlan(
      plan,
    );
    first.registerDecision(
      decision,
    );
    first.approvePlan(
      mission.id,
    );
    const lockedPlan =
      first.lockPlan(
        mission.id,
      );

    const checkpointState =
      first.updateState(
        mission.id,
        {
          activeTaskIds: [
            "task-two",
          ],
          completedTaskIds: [
            "task-one",
          ],
          evidenceIds: [
            "evidence-task-one",
          ],
        },
      );

    first.createCheckpoint({
      id: "checkpoint-durable-disk-001",
      missionId: mission.id,
      planId: lockedPlan.id,
      planVersion: lockedPlan.version,
      state: checkpointState,
      summary: "Task one completed before runtime reconstruction.",
      reason: "Restart durability proof.",
      createdAt: "2026-09-02T00:00:01.000Z",
    });

    const second =
      new DurableMissionContinuityStore(
        stateFile,
      );

    const restoredMission =
      second.getMission(
        mission.id,
      );
    const restoredPlan =
      second.getPlan(
        mission.id,
      );
    const restoredState =
      second.getState(
        mission.id,
      );
    const restoredCheckpoint =
      second.getLatestCheckpoint(
        mission.id,
      );
    const restoredDecision =
      second.getDecision(
        decision.id,
      );

    assert(
      restoredMission?.id === mission.id,
      "mission must survive store reconstruction",
    );
    assert(
      restoredPlan?.approvedByHuman === true &&
        restoredPlan.locked === true,
      "plan approval and lock must survive store reconstruction",
    );
    assert(
      restoredState?.completedTaskIds.includes(
        "task-one",
      ),
      "completed task state must survive store reconstruction",
    );
    assert(
      restoredState?.activeTaskIds.includes(
        "task-two",
      ),
      "next active task must survive store reconstruction",
    );
    assert(
      restoredCheckpoint?.id ===
        "checkpoint-durable-disk-001",
      "latest checkpoint must survive store reconstruction",
    );
    assert(
      restoredDecision?.id ===
        decision.id,
      "mission decisions must survive store reconstruction",
    );

    second.updateState(
      mission.id,
      {
        activeTaskIds: [],
        completedTaskIds: [
          "task-one",
          "task-two",
        ],
        evidenceIds: [
          "evidence-task-one",
          "evidence-task-two",
        ],
      },
    );

    const third =
      new DurableMissionContinuityStore(
        stateFile,
      );

    assert(
      third.getState(
        mission.id,
      )?.completedTaskIds.includes(
        "task-two",
      ),
      "state updates after recovery must remain durable",
    );

    console.log(
      "K.I.N.G.S. DURABLE MISSION CONTINUITY → DISK RELOAD: SUCCESS",
    );
    console.log(
      "K.I.N.G.S. DURABLE MISSION CONTINUITY → POST-RECOVERY WRITE: SUCCESS",
    );
    console.log(
      "TREE-DURABLE-MISSION-CONTINUITY: SUCCESS",
    );
  } finally {
    rmSync(
      root,
      {
        recursive: true,
        force: true,
      },
    );
  }
}

main();
