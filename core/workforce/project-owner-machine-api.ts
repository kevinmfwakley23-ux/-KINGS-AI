import type {
  ID,
  Mission,
  Task,
} from "./types";

import type {
  MissionPlan,
} from "./mission-continuity";

import {
  KingsCodingMachine,
} from "./kings-coding-machine";

import type {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import {
  ProjectOwnerUiController,
  type ProjectOwnerDesignInput,
  type ProjectOwnerMissionView,
  validateProjectOwnerDesignInput,
} from "./project-owner-ui-contract";

import {
  ModelDrivenCodingExecutionAuthority,
} from "./model-driven-coding-execution";

import type {
  ModelExecutionRequest,
} from "./model-interface";

import type {
  ModelRoutingRequest,
} from "./model-routing";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

export interface ProjectOwnerMachineApiRequest {
  action:
    | "create-mission"
    | "approve-plan"
    | "lock-plan"
    | "snapshot"
    | "execute-next";

  input?: ProjectOwnerDesignInput;
  missionId?: ID;
  editor?: EngineeringRepairEditor;
  buildTestOptions?: ConstructorParameters<
    typeof import("./coding-work-unit-execution").CodingWorkUnitExecutionAuthority
  >[1];
}

export interface ProjectOwnerMachineApiResponse {
  ok: boolean;
  message: string;
  view?: ProjectOwnerMissionView;
  plan?: MissionPlan;
}

export interface ProjectOwnerMissionFactory {
  create(input: ProjectOwnerDesignInput): {
    mission: Mission;
    plan: MissionPlan;
  };
}

export interface ProjectOwnerExecutionContext {
  getTask(taskId: ID): Task | undefined;
  getWorkUnit(taskId: ID): WorkUnitContract;
}

export class ProjectOwnerMachineApi {
  private readonly controller: ProjectOwnerUiController;

  constructor(
    private readonly machine: KingsCodingMachine,
    private readonly missionFactory: ProjectOwnerMissionFactory,
    private readonly modelDrivenCoding: ModelDrivenCodingExecutionAuthority,
    private readonly executionContext: ProjectOwnerExecutionContext,
    controller: ProjectOwnerUiController = new ProjectOwnerUiController(),
  ) {
    this.controller = controller;
  }

  async handle(
    request: ProjectOwnerMachineApiRequest,
  ): Promise<ProjectOwnerMachineApiResponse> {
    try {
      if (request.action === "create-mission") {
        if (!request.input) {
          return { ok: false, message: "A project design input is required." };
        }

        const validation = validateProjectOwnerDesignInput(request.input);
        if (validation.length > 0) {
          return { ok: false, message: validation.join(" ") };
        }

        const design = this.controller.createMissionRequest(request.input);
        const created = this.missionFactory.create(design);

        const taskIds = created.plan.milestones.flatMap((milestone) => milestone.taskIds);
        if (taskIds.length === 0) {
          return {
            ok: false,
            message: "Mission compiler produced no executable coding task. Mission creation aborted.",
          };
        }

        for (const taskId of taskIds) {
          if (!this.executionContext.getTask(taskId)) {
            return {
              ok: false,
              message: `Mission compiler produced task "${taskId}" but it is not registered in the local workforce runtime. Mission creation aborted.`,
            };
          }

          try {
            this.executionContext.getWorkUnit(taskId);
          } catch (error) {
            return {
              ok: false,
              message:
                error instanceof Error
                  ? error.message
                  : `Mission compiler produced task "${taskId}" without a registered governed work unit.`,
            };
          }
        }

        const snapshot = this.machine.startMission({
          mission: created.mission,
          plan: created.plan,
        });

        return {
          ok: true,
          message:
            "Vision compiled into an executable coding mission. Human approval is required before execution.",
          view: {
            mission: snapshot.mission,
            plan: snapshot.plan,
            state: snapshot.state,
          },
        };
      }

      const missionId = request.missionId?.trim();
      if (!missionId) {
        return { ok: false, message: "Mission id is required." };
      }

      if (request.action === "approve-plan") {
        const plan = this.machine.approvePlan(missionId);
        const snapshot = this.machine.snapshot(missionId);
        return {
          ok: true,
          message: "Mission plan approved.",
          plan,
          view: {
            mission: snapshot.mission,
            plan: snapshot.plan,
            state: snapshot.state,
          },
        };
      }

      if (request.action === "lock-plan") {
        const plan = this.machine.lockPlan(missionId);
        const snapshot = this.machine.snapshot(missionId);
        return {
          ok: true,
          message: "Mission plan locked and ready for governed execution.",
          plan,
          view: {
            mission: snapshot.mission,
            plan: snapshot.plan,
            state: snapshot.state,
          },
        };
      }

      if (request.action === "snapshot") {
        const snapshot = this.machine.snapshot(missionId);
        return {
          ok: true,
          message: this.controller.summarize({
            mission: snapshot.mission,
            plan: snapshot.plan,
            state: snapshot.state,
          }),
          view: {
            mission: snapshot.mission,
            plan: snapshot.plan,
            state: snapshot.state,
          },
        };
      }

      if (request.action === "execute-next") {
        const snapshot = this.machine.snapshot(missionId);

        if (!snapshot.plan.approvedByHuman || !snapshot.plan.locked) {
          return {
            ok: false,
            message: "Mission must be approved and locked before execution.",
            view: {
              mission: snapshot.mission,
              plan: snapshot.plan,
              state: snapshot.state,
            },
          };
        }

        if (snapshot.state.activeTaskIds.length > 1) {
          return {
            ok: false,
            message: "Mission has more than one active task; execution routing is ambiguous.",
            view: {
              mission: snapshot.mission,
              plan: snapshot.plan,
              state: snapshot.state,
            },
          };
        }

        const taskId =
          snapshot.state.activeTaskIds[0] ??
          snapshot.plan.milestones
            .flatMap((milestone) => milestone.taskIds)
            .find(
              (id) =>
                !snapshot.state.completedTaskIds.includes(id) &&
                !snapshot.state.failedTaskIds.includes(id),
            );

        if (!taskId) {
          return {
            ok: false,
            message: "No executable coding task is available for this mission.",
            view: {
              mission: snapshot.mission,
              plan: snapshot.plan,
              state: snapshot.state,
            },
          };
        }

        const task = this.executionContext.getTask(taskId);
        if (!task) {
          return {
            ok: false,
            message: `Coding task "${taskId}" is not registered in the local workforce runtime.`,
          };
        }

        const workUnit = this.executionContext.getWorkUnit(taskId);
        const modelRequest: ModelExecutionRequest = {
          id: `model-request-${taskId}-${Date.now()}`,
          taskId,
          missionId,
          messages: [
            {
              role: "system",
              content:
                "You are the coding engine inside K.I.N.G.S. Coding Machine. Turn the owner's software vision into working source code. Return only authorized FILE blocks in the format FILE: path [create|replace] followed by the complete file contents. Do not explain outside FILE blocks.",
            },
            {
              role: "user",
              content:
                `${workUnit.objective}\n\nAcceptance criteria:\n${workUnit.acceptanceCriteria.join("\n")}\n\nTask: ${task.description}`,
            },
          ],
          requiredCapabilities: [
            "reasoning",
            "planning",
            "coding",
            "debugging",
            "source-inspection",
            "verification",
            "recovery",
          ],
          inputModalities: ["text"],
          outputModality: "text",
          maxOutputTokens: workUnit.budget.maxTokens,
          temperature: 0.1,
          requireStructuredOutput: false,
          allowToolProposals: false,
        };

        const routing: ModelRoutingRequest = {
          requiredCapabilities: [
            "reasoning",
            "planning",
            "coding",
            "debugging",
            "source-inspection",
            "verification",
            "recovery",
          ],
          minimumCapabilityStrength: 70,
          requiredInputModality: "text",
          requiredOutputModality: "text",
          preferInternal: true,
          maximumEstimatedCost: 0,
        };

        if (!request.editor || !request.buildTestOptions) {
          return {
            ok: false,
            message: "Local execution runtime is not attached to the owner controller.",
          };
        }

        const result = await this.modelDrivenCoding.execute(
          {
            modelRequest,
            routing,
            machineRequest: {
              proposalParser: {
                expectedTaskId: taskId,
                expectedMissionId: missionId,
                allowedPaths: workUnit.allowedPaths,
                allowMultipleFiles: true,
              },
              execution: {
                taskId,
                projectId: missionId,
                workUnit: { ...workUnit, approved: true },
                execution: {
                  id: `execution-${taskId}`,
                  projectId: missionId,
                  status: "ready",
                  steps: [
                    {
                      id: taskId,
                      language: "typescript",
                      operation: "create",
                      capabilityId: "engineering-typescript",
                      sequence: 1,
                    },
                  ],
                  currentStepId: taskId,
                  completedStepIds: [],
                  blockedReasons: [],
                },
                step: {
                  id: taskId,
                  language: "typescript",
                  operation: "create",
                  capabilityId: "engineering-typescript",
                  sequence: 1,
                },
                workspace: {
                  id: `workspace-${missionId}`,
                  projectId: missionId,
                  rootPath: process.cwd(),
                  allowedPaths: workUnit.allowedPaths,
                  allowedLanguages: ["typescript"],
                  allowedOperations: ["create"],
                  active: true,
                },
                repairStep: {
                  id: `repair-${taskId}`,
                  strategy: "edit",
                  description: "Repair generated application until verification passes.",
                  reason: "Bounded local build/test recovery.",
                  required: true,
                },
                buildTestSteps: [],
                requiredCriteria: workUnit.acceptanceCriteria,
              },
            },
          },
          request.editor,
          request.buildTestOptions,
        );

        const next = this.machine.snapshot(missionId);
        return {
          ok: result.completed,
          message: result.completed
            ? `Coding task "${taskId}" completed and verified.`
            : `Coding task "${taskId}" did not satisfy completion criteria.`,
          view: {
            mission: next.mission,
            plan: next.plan,
            state: next.state,
          },
        };
      }

      return { ok: false, message: "Unsupported Project Owner action." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
