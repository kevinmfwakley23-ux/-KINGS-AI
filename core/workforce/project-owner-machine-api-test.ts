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
      status: "planned",
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
        id: `plan-${missionId}`,
        missionId,
        version: 1,
        objective: "Test project",
        milestones: [],
        decisionIds: [],
        acceptanceCriteria: [
          "Project is created.",
        ],
        locked: false,
        approvedByHuman: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },

    lockPlan(missionId: string) {
      calls.push(`lock:${missionId}`);
      return {
        id: `plan-${missionId}`,
        missionId,
        version: 1,
        objective: "Test project",
        milestones: [],
        decisionIds: [],
        acceptanceCriteria: [
          "Project is created.",
        ],
        locked: true,
        approvedByHuman: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },

    snapshot(missionId: string) {
      calls.push(`snapshot:${missionId}`);
      return {
        mission: {
          id: missionId,
          name: "Test project",
          description: "Test project",
          status: "planned" as const,
          objectives: [
            "Test project",
          ],
          sourceReferences: [
            "project-owner-ui",
          ],
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        plan: {
          id: `plan-${missionId}`,
          missionId,
          version: 1,
          objective: "Test project",
          milestones: [],
          decisionIds: [],
          acceptanceCriteria: [
            "Project is created.",
          ],
          locked: true,
          approvedByHuman: true,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        state: {
          missionId,
          activeTaskIds: [],
          completedTaskIds: [],
          failedTaskIds: [],
          blockedTaskIds: [],
          evidenceIds: [],
          updatedAt: new Date().toISOString(),
        },
      };
    },
  };

  const api =
    new ProjectOwnerMachineApi(
      fakeMachine as any,
      {
        create:
          createMission,
      },
    );

  const controller =
    new ProjectOwnerUiController();

  const input =
    controller.createMissionRequest({
      id:
        "owner-ui-test",
      projectName:
        "Owner UI Test Project",
      objective:
        "Create a governed project from typed design requirements.",
      requirements: [
        "Typed requirements are preserved.",
      ],
      preferredPlatform:
        "Linux",
      preferredLanguage:
        "TypeScript",
      constraints: [
        "No unauthorized paths.",
      ],
      acceptanceCriteria: [
        "Project mission exists.",
      ],
    });

  const created =
    api.createMission(
      input,
    );

  assert(
    created.ok,
    "owner UI must create a mission",
  );

  assert(
    created.view?.mission.id ===
      "owner-ui-test",
    "created mission id must be preserved",
  );

  console.log(
    "K.I.N.G.S. OWNER UI → MACHINE MISSION: SUCCESS",
  );

  const approved =
    api.approvePlan(
      "owner-ui-test",
    );

  assert(
    approved.ok,
    "owner UI must approve the plan",
  );

  const locked =
    api.lockPlan(
      "owner-ui-test",
    );

  assert(
    locked.ok,
    "owner UI must lock the plan",
  );

  console.log(
    "K.I.N.G.S. OWNER UI → APPROVAL/LOCK: SUCCESS",
  );

  const snapshot =
    api.snapshot(
      "owner-ui-test",
    );

  assert(
    snapshot.ok,
    "owner UI must return a mission snapshot",
  );

  assert(
    snapshot.view?.plan.locked ===
      true,
    "snapshot must expose locked plan state",
  );

  assert(
    calls.join(",") ===
      "create,approve:owner-ui-test,lock:owner-ui-test,snapshot:owner-ui-test",
    "owner UI actions must map to the coding machine in governed order",
  );

  console.log(
    "K.I.N.G.S. OWNER UI → MISSION SNAPSHOT: SUCCESS",
  );

  console.log(
    "TREE-KCM-PROJECT-OWNER-MACHINE-API: SUCCESS",
  );
}

main();
