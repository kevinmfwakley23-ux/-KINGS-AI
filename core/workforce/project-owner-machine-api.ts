import {
  join,
} from "node:path";

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

import type {
  EngineeringLanguage,
} from "./engineering-toolchain";

export interface ProjectOwnerMachineApiRequest {
  action:
    | "create-mission"
    | "approve-plan"
    | "lock-plan"
    | "snapshot"
    | "execute-next";

  input?: ProjectOwnerDesignInput;
  missionId?: ID;
  preferredProviderId?: ID;
  preferredModelId?: ID;
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
  workspacePath?: string;
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

const PROJECT_LANGUAGES: EngineeringLanguage[] = [
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "css",
  "html",
  "sql",
  "shell",
  "json",
  "yaml",
  "markdown",
  "text",
];

function safeWorkspaceSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^\.+/, "")
    .replace(/-+/g, "-")
    .slice(0, 96);

  if (!normalized) {
    throw new Error(
      "K.I.N.G.S. Project Owner: mission id cannot be converted into a safe workspace name.",
    );
  }

  return normalized;
}

export class ProjectOwnerMachineApi {
  private readonly controller: ProjectOwnerUiController;

  constructor(
    private readonly machine: KingsCodingMachine,
    private readonly missionFactory: ProjectOwnerMissionFactory,
    private readonly modelDrivenCoding: ModelDrivenCodingExecutionAuthority,
    private readonly executionContext: ProjectOwnerExecutionContext,
    controller: ProjectOwnerUiController = new ProjectOwnerUiController(),
    private readonly workspaceRoot: string = join(
      process.cwd(),
      ".kings",
      "projects",
    ),
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
          workspacePath: join(
            this.workspaceRoot,
            safeWorkspaceSegment(created.mission.id),
          ),
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

      const missionWorkspace = join(
        this.workspaceRoot,
        safeWorkspaceSegment(missionId),
      );

      if (request.action === "approve-plan") {
        const plan = this.machine.approvePlan(missionId);
        const snapshot = this.machine.snapshot(missionId);
        return {
          ok: true,
          message: "Mission plan approved.",
          plan,
          workspacePath: missionWorkspace,
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
          workspacePath: missionWorkspace,
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
          workspacePath: missionWorkspace,
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
              workspacePath: missionWorkspace,
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
              workspacePath: missionWorkspace,
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
              workspacePath: missionWorkspace,
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

          const numberedCriteria = workUnit.acceptanceCriteria
            .map((criterion, index) => `ACCEPTANCE-${index + 1}: ${criterion}`)
            .join("\n");

          const modelRequest: ModelExecutionRequest = {
            id: `model-request-${taskId}-${Date.now()}`,
            taskId,
            missionId,
            messages: [
              {
                role: "system",
                content: [
                  "You are the production coding engine inside K.I.N.G.S. Coding Machine.",
                  "Generate real runnable software, never placeholder-only, mock-only, TODO-only, pseudocode, or fake-success code.",
                  "Return ONLY FILE blocks. Every file must start exactly with FILE: relative/path [create|replace], followed by complete file contents. No Markdown fences and no explanation outside FILE blocks.",
                  "Include every manifest, configuration, source file, and automated test required for the project to install, build, run, and verify in a clean project workspace.",
                  "Every acceptance criterion must be exercised by executable tests or a real launch/smoke path. Do not write tests that merely assert true, print a green marker, or duplicate the implementation without exercising behavior.",
                  "For browser applications, include a responsive viewport and layouts usable on Chromebook and Android phone/tablet screens.",
                  "Never propose paths outside the authorized workspace. K.I.N.G.S. will independently execute build/test/smoke verification and reject uncovered criteria.",
                ].join(" "),
              },
              {
                role: "user",
                content:
                  `${workUnit.objective}\n\nAcceptance criteria:\n${numberedCriteria}\n\nTask: ${task.description}\n\nBuild the complete project in the current isolated workspace.`,
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

          const explicitModel = Boolean(
            request.preferredProviderId || request.preferredModelId,
          );

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
            preferInternal: !explicitModel,
            preferredProviderId: request.preferredProviderId,
            preferredModelId: request.preferredModelId,
            allowUnverifiedExplicitSelection: explicitModel,
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
                  missionId,
                  projectId: missionId,
                  workUnit: { ...workUnit, approved: true },
                  execution: {
                    id: `execution-${taskId}`,
                    projectId: missionId,
                    status: "ready",
                    steps: [
                      {
                        id: taskId,
                        language: "text",
                        operation: "create",
                        capabilityId: "engineering-project",
                        sequence: 1,
                      },
                    ],
                    currentStepId: taskId,
                    completedStepIds: [],
                    blockedReasons: [],
                  },
                  step: {
                    id: taskId,
                    language: "text",
                    operation: "create",
                    capabilityId: "engineering-project",
                    sequence: 1,
                  },
                  workspace: {
                    id: `workspace-${missionId}`,
                    projectId: missionId,
                    rootPath: missionWorkspace,
                    allowedPaths: workUnit.allowedPaths,
                    allowedLanguages: PROJECT_LANGUAGES,
                    allowedOperations: ["create", "replace"],
                    active: true,
                  },
                  repairStep: {
                    id: `repair-${taskId}`,
                    strategy: "edit",
                    description: "Write or repair generated application until governed verification passes.",
                    reason: "Bounded local build/test recovery.",
                    required: true,
                  },
                  buildTestSteps: [],
                  autoPlanBuildTest: true,
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
              ? `Coding task "${taskId}" completed with project-aware build/test verification.`
              : `Coding task "${taskId}" did not satisfy real completion criteria.`,
            diagnostics: result.failureDiagnostics,
            workspacePath: missionWorkspace,
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
            workspacePath: missionWorkspace,
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
