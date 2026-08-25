import {
  ProjectOwnerMachineApi,
  type ProjectOwnerMissionFactory,
  type ProjectOwnerExecutionContext,
} from "./project-owner-machine-api";

import {
  ProjectOwnerUiController,
} from "./project-owner-ui-contract";

import type {
  Mission,
  Task,
} from "./types";

import type {
  MissionPlan,
} from "./mission-continuity";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

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

const taskId = "task-owner-ui-test";

function createTask(
  missionId: string,
): Task {
  const now = new Date().toISOString();
  return {
    id: taskId,
    missionId,
    name: "Owner UI test task",
    description: "Validate owner mission lifecycle.",
    requiredCapabilities: ["coding"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: ["mission lifecycle verified"],
    createdAt: now,
    updatedAt: now,
  };
}

function createMission(
  input: Parameters<ProjectOwnerMissionFactory["create"]>[0],
): {
  mission: Mission;
  plan: MissionPlan;
} {
  const now = new Date().toISOString();

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
      milestones: [
        {
          id: `milestone-${input.id}`,
          missionId: input.id,
          name: "Build",
          objective: input.objective,
          taskIds: [taskId],
          dependencyIds: [],
          status: "active",
        },
      ],
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

async function main(): Promise<void> {
  const fakeMachine = {
    startMission(request: any) {
      return {
        mission: request.mission,
        plan: request.plan,
        state: {
          missionId: request.mission.id,
          activeTaskIds: [taskId],
          completedTaskIds: [],
          failedTaskIds: [],
          blockedTaskIds: [],
          evidenceIds: [],
          updatedAt: request.mission.updatedAt,
        },
      };
    },

    approvePlan(missionId: string) {
      return {
        id: `plan-${missionId}`,
        missionId,
        version: 1,
        objective: "Test project",
        milestones: [
          {
            id: `milestone-${missionId}`,
            missionId,
            name: "Build",
            objective: "Test project",
            taskIds: [taskId],
            dependencyIds: [],
            status: "active" as const,
          },
        ],
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
      return {
        id: `plan-${missionId}`,
        missionId,
        version: 1,
        objective: "Test project",
        milestones: [
          {
            id: `milestone-${missionId}`,
            missionId,
            name: "Build",
            objective: "Test project",
            taskIds: [taskId],
            dependencyIds: [],
            status: "active" as const,
          },
        ],
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
          milestones: [
            {
              id: `milestone-${missionId}`,
              missionId,
              name: "Build",
              objective: "Test project",
              taskIds: [taskId],
              dependencyIds: [],
              status: "active" as const,
            },
          ],
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
          activeTaskIds: [taskId],
          completedTaskIds: [],
          failedTaskIds: [],
          blockedTaskIds: [],
          evidenceIds: [],
          updatedAt: new Date().toISOString(),
        },
      };
    },
  };

  const task = createTask("owner-ui-test");
  const workUnit: WorkUnitContract = {
    id: "work-unit-owner-ui-test",
    role: "coding-engineer",
    objective: task.description,
    capabilityIds: ["coding"],
    allowedToolIds: [],
    allowedPaths: ["."],
    budget: {
      maxTimeMs: 1_000,
      maxTokens: 100,
      maxIterations: 1,
    },
    dependencyIds: [],
    acceptanceCriteria: ["mission lifecycle verified"],
    requiredEvidenceTypes: ["command"],
    approved: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const executionContext: ProjectOwnerExecutionContext = {
    getTask: (id) => id === taskId ? task : undefined,
    getWorkUnit: (id) => {
      if (id !== taskId) {
        throw new Error(`Unknown work unit: ${id}`);
      }
      return workUnit;
    },
  };

  const modelDrivenCoding = {
    async execute() {
      throw new Error("Model-driven execution is not part of this owner API lifecycle test.");
    },
  };

  const api =
    new ProjectOwnerMachineApi(
      fakeMachine as any,
      {
        create:
          createMission,
      },
      modelDrivenCoding as any,
      executionContext,
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
    await api.handle({
      action:
        "create-mission",
      input,
    });

  assert(
    created.ok,
    created.message,
  );

  assert(
    created.view?.mission.id ===
      "owner-ui-test",
    "created mission id must be preserved",
  );

  assert(
    created.view?.plan.locked ===
      false,
    "new mission plan must begin unlocked",
  );

  console.log(
    "K.I.N.G.S. OWNER UI → MACHINE MISSION: SUCCESS",
  );

  const approved =
    await api.handle({
      action:
        "approve-plan",
      missionId:
        "owner-ui-test",
    });

  assert(
    approved.ok,
    approved.message,
  );

  assert(
    approved.plan?.approvedByHuman ===
      true,
    "approval action must return an approved plan",
  );

  const locked =
    await api.handle({
      action:
        "lock-plan",
      missionId:
        "owner-ui-test",
    });

  assert(
    locked.ok,
    locked.message,
  );

  assert(
    locked.plan?.locked ===
      true,
    "lock action must return a locked plan",
  );

  console.log(
    "K.I.N.G.S. OWNER UI → APPROVAL/LOCK: SUCCESS",
  );

  const snapshot =
    await api.handle({
      action:
        "snapshot",
      missionId:
        "owner-ui-test",
    });

  assert(
    snapshot.ok,
    snapshot.message,
  );

  assert(
    snapshot.view?.plan.locked ===
      true,
    "snapshot must expose locked plan state",
  );

  assert(
    snapshot.view?.plan.approvedByHuman ===
      true,
    "snapshot must expose human approval",
  );

  assert(
    snapshot.view?.state.missionId ===
      "owner-ui-test",
    "snapshot must preserve mission identity",
  );

  console.log(
    "K.I.N.G.S. OWNER UI → MISSION SNAPSHOT: SUCCESS",
  );

  console.log(
    "TREE-KCM-PROJECT-OWNER-MACHINE-API: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      "TREE-KCM-PROJECT-OWNER-MACHINE-API: FAILURE",
    );
    console.error(
      error,
    );
    process.exitCode = 1;
  },
);
