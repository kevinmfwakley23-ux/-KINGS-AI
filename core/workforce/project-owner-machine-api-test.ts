import {
  ProjectOwnerMachineApi,
  type ProjectOwnerMissionFactory,
} from "./project-owner-machine-api";

import {
  ProjectOwnerUiController,
} from "./project-owner-ui-contract";

import type {
  Mission,
} from "./types";

import type {
  MissionPlan,
} from "./mission-continuity";

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

function createMission(
  input: Parameters<ProjectOwnerMissionFactory["create"]>[0],
): {
  mission: Mission;
  plan: MissionPlan;
} {
  const now =
    new Date().toISOString();

  return {
    mission: {
      id: input.id,
      name: input.projectName,
      description: input.objective,
      status: "draft",
      objectives: [input.objective],
      sourceReferences: [
        "project-owner-ui",
      ],
      createdAt: now,
      updatedAt: now,
    },
    plan: {
      id: `plan-${input.id}`,
      missionId: input.id,
      version: 1,
      objective: input.objective,
      milestones: [],
      decisionIds: [],
      acceptanceCriteria:
        input.acceptanceCriteria,
      locked: false,
      approvedByHuman: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function main(): void {
  const calls: string[] = [];

  const fakeMachine = {
    startMission(request: any) {
      calls.push("create");
      return {
        mission: request.mission,
        plan: request.plan,
        state: {
          missionId: request.mission.id,
          activeTaskIds: [],
          completedTaskIds: [],
          failedTaskIds: [],
          blockedTaskIds: [],
          evidenceIds: [],
          updatedAt: request.mission.updatedAt,
        },
      };
    },

    approvePlan(missionId: string) {
      calls.push(`approve:${missionId}`);
      return {
        ...createMission({
          id: missionId,
          projectName: "fixture",
          objective: "fixture",
          requirements: ["fixture"],
          constraints: [],
          acceptanceCriteria: ["fixture"],
        }).plan,
        approvedByHuman: true,
      };
    },

    lockPlan(missionId: string) {
      calls.push(`lock:${missionId}`);
      return {
        ...createMission({
          id: missionId,
          projectName: "fixture",
          objective: "fixture",
          requirements: ["fixture"],
          constraints: [],
          acceptanceCriteria: ["fixture"],
        }).plan,
        approvedByHuman: true,
        locked: true,
      };
    },

    snapshot(missionId: string) {
      calls.push(`snapshot:${missionId}`);
      const now =
        new Date().toISOString();
      return {
        mission: {
          id: missionId,
          name: "Fixture Mission",
          description: "Fixture mission.",
          status: "active",
          objectives: [
            "Fixture mission.",
          ],
          sourceReferences: [],
          createdAt: now,
          updatedAt: now,
        },
        plan: {
          id: `plan-${missionId}`,
          missionId,
          version: 1,
          objective: "Fixture mission.",
          milestones: [],
          decisionIds: [],
          acceptanceCriteria: [
            "Fixture mission.",
          ],
          locked: true,
          approvedByHuman: true,
          createdAt: now,
          updatedAt: now,
        },
        state: {
          missionId,
          activeTaskIds: [],
          completedTaskIds: [],
          failedTaskIds: [],
          blockedTaskIds: [],
          evidenceIds: [],
          updatedAt: now,
        },
      };
    },
  } as any;

  const api =
    new ProjectOwnerMachineApi(
      fakeMachine,
      {
        create:
          createMission,
      },
      new ProjectOwnerUiController(),
    );

  const created =
    api.handle({
      action:
        "create-mission",
      input: {
        id:
          "mission-owner-ui-test",
        projectName:
          "Owner Console Test",
        objective:
          "Build a project from typed design requirements.",
        requirements: [
          "Provide a working application.",
        ],
        preferredPlatform:
          "Linux",
        preferredLanguage:
          "TypeScript",
        constraints: [
          "Use local tooling where possible.",
        ],
        acceptanceCriteria: [
          "Application starts successfully.",
        ],
      },
    });

  assert(
    created.ok,
    "owner create action must succeed",
  );

  assert(
    calls.includes("create"),
    "owner create action must call the machine",
  );

  const approved =
    api.handle({
      action:
        "approve-plan",
      missionId:
        "mission-owner-ui-test",
    });

  assert(
    approved.ok,
    "owner approve action must succeed",
  );

  const locked =
    api.handle({
      action:
        "lock-plan",
      missionId:
        "mission-owner-ui-test",
    });

  assert(
    locked.ok,
    "owner lock action must succeed",
  );

  const snapshot =
    api.handle({
      action:
        "snapshot",
      missionId:
        "mission-owner-ui-test",
    });

  assert(
    snapshot.ok,
    "owner snapshot action must succeed",
  );

  assert(
    snapshot.view !== undefined,
    "owner snapshot must return mission view",
  );

  assert(
    calls.includes(
      "approve:mission-owner-ui-test",
    ),
    "approval must reach the machine",
  );

  assert(
    calls.includes(
      "lock:mission-owner-ui-test",
    ),
    "lock must reach the machine",
  );

  console.log(
    "K.I.N.G.S. OWNER UI → MACHINE MISSION: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. OWNER UI → APPROVAL/LOCK: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. OWNER UI → MISSION SNAPSHOT: SUCCESS",
  );

  console.log(
    "TREE-KCM-PROJECT-OWNER-MACHINE-API: SUCCESS",
  );
}

main();
