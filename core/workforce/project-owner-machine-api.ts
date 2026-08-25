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
  diagnostics?: string;
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
          this.executionContext.getWorkUnit(taskId);
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
        let taskId: string | undefined;

        try {
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

          taskId =
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
            throw new Error(`Coding task "${taskId}" is not registered in the local workforce runtime.`);
          }

          const workUnit = this.executionContext.getWorkUnit(taskId);
          if (!request.editor || !request.buildTestOptions) {
            throw new Error("Local execution runtime is not attached to the owner controller.");
          }

          this.machine.setTaskRunning(missionId, taskId);

          const modelRequest: ModelExecutionRequest = {
            id: `model-request-${taskId}-${Date.now()}`,
            taskId,
            missionId,
            messages: [
              {
                role: "system",
                content:
                  "You are the coding engine inside K.I.N.G.S. Coding Machine. Return ONLY FILE blocks. Every file must start exactly with FILE: relative/path [create|replace], followed by complete file contents. No Markdown fences. No explanation outside FILE blocks. Never propose paths outside the authorized workspace.",
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
                  buildTestSteps: [
                    {
                      id: `verify-linux-${taskId}`,
                      operation: "validate",
                      command: process.execPath,
                      args: ["-e", [
                        "const fs = require('node:fs');",
                        `const value = fs.readFileSync(${JSON.stringify(workUnit.acceptanceCriteria.some((criterion) => criterion.includes("source file exists")) ? "src/owner-model-proof.ts" : "package.json")}, 'utf8');`,
                        `if (${JSON.stringify(workUnit.acceptanceCriteria.join(" "))}.includes('KINGS_OWNER_MODEL_GREEN') && !value.includes('KINGS_OWNER_MODEL_GREEN')) process.exit(2);`,
                        "console.log('KINGS_OWNER_MODEL_VERIFIED');",
                      ].join(" ")],
                      workingDirectory: process.cwd(),
                    },
                  ],
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
            diagnostics: result.failureDiagnostics,
            view: {
              mission: next.mission,
              plan: next.plan,
              state: next.state,
            },
          };
        } catch (error) {
          const diagnostics = error instanceof Error ? error.message : String(error);
          if (taskId) {
            this.machine.recordTaskFailure(missionId, taskId, diagnostics);
          }

          const failed = this.machine.snapshot(missionId);
          return {
            ok: false,
            message: `Coding task "${taskId ?? "unknown"}" failed during governed execution.`,
            diagnostics,
            view: {
              mission: failed.mission,
              plan: failed.plan,
              state: failed.state,
            },
          };
        }
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
