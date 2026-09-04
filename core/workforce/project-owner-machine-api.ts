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
  ModelCostPreference,
  ModelRoutingRequest,
} from "./model-routing";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

import type {
  EngineeringLanguage,
} from "./engineering-toolchain";

import {
  GitHubRepositoryWorkspaceAuthority,
} from "./github-repository-workspace";

import {
  RepositoryCodingContextAuthority,
} from "./repository-coding-context";

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
  /**
   * Owner-controlled economics policy for this execution. Economy is the
   * default. Free-only and local-only are hard routing boundaries; quality is
   * an explicit opt-in escalation policy.
   */
  costPreference?: ModelCostPreference;
  /**
   * Optional hard route-cost ceiling. Unknown price is not represented as zero;
   * the ModelRouter remains the authority that decides whether a route has
   * sufficient cost evidence to satisfy the ceiling.
   */
  maximumEstimatedCost?: number;
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
  repository?: {
    repositoryId: string;
    baseRef: string;
    publishBranch: string;
    published?: boolean;
    commitSha?: string;
    inspectedFiles?: string[];
  };
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
    private readonly repositoryWorkspace?: GitHubRepositoryWorkspaceAuthority,
    private readonly repositoryCodingContext: RepositoryCodingContextAuthority =
      new RepositoryCodingContextAuthority(),
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
        const missionWorkspace = join(
          this.workspaceRoot,
          safeWorkspaceSegment(design.id),
        );

        let preparedRepository:
          Awaited<ReturnType<GitHubRepositoryWorkspaceAuthority["prepare"]>> |
          undefined;

        if (design.repository) {
          if (!this.repositoryWorkspace) {
            return {
              ok: false,
              message:
                "GitHub repository mode is not attached to this K.I.N.G.S. runtime.",
            };
          }

          preparedRepository = await this.repositoryWorkspace.prepare({
            missionId: design.id,
            workspaceRoot: missionWorkspace,
            repository: design.repository,
          });
        }

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
          message: preparedRepository
            ? `GitHub repository ${preparedRepository.metadata.repositoryId} checked out on ${preparedRepository.metadata.publishBranch}. Vision compiled into an executable coding mission; human approval is required before code changes execute.`
            : "Vision compiled into an executable coding mission. Human approval is required before execution.",
          workspacePath: missionWorkspace,
          repository: preparedRepository
            ? {
                repositoryId: preparedRepository.metadata.repositoryId,
                baseRef: preparedRepository.metadata.baseRef,
                publishBranch: preparedRepository.metadata.publishBranch,
              }
            : undefined,
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

      const managedRepository = this.repositoryWorkspace
        ? await this.repositoryWorkspace.readMetadata(missionWorkspace)
        : undefined;
      const repositoryResponse = managedRepository
        ? {
            repositoryId: managedRepository.repositoryId,
            baseRef: managedRepository.baseRef,
            publishBranch: managedRepository.publishBranch,
          }
        : undefined;

      if (request.action === "approve-plan") {
        const plan = this.machine.approvePlan(missionId);
        const snapshot = this.machine.snapshot(missionId);
        return {
          ok: true,
          message: "Mission plan approved.",
          plan,
          workspacePath: missionWorkspace,
          repository: repositoryResponse,
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
          repository: repositoryResponse,
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
          repository: repositoryResponse,
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
              repository: repositoryResponse,
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
              repository: repositoryResponse,
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
              repository: repositoryResponse,
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

          const repositoryContext = managedRepository
            ? await this.repositoryCodingContext.build({
                workspaceRoot: missionWorkspace,
                missionId,
                objective: workUnit.objective,
                requirements: [task.description, ...workUnit.acceptanceCriteria],
              })
            : undefined;

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
                  "For an existing repository, preserve working architecture and make the smallest complete changes supported by inspected source. Never invent the contents of an unseen file.",
                  "Include every manifest, configuration, source file, and automated test required for the project to install, build, run, and verify in a clean project workspace.",
                  "Every acceptance criterion must be exercised by executable tests or a real launch/smoke path. Do not write tests that merely assert true, print a green marker, or duplicate the implementation without exercising behavior.",
                  "For browser applications, include a responsive viewport and layouts usable on Chromebook and Android phone/tablet screens.",
                  "Never propose paths outside the authorized workspace. K.I.N.G.S. will independently execute build/test/smoke verification and reject uncovered criteria.",
                ].join(" "),
              },
              {
                role: "user",
                content: [
                  workUnit.objective,
                  "",
                  "Acceptance criteria:",
                  numberedCriteria,
                  "",
                  `Task: ${task.description}`,
                  "",
                  managedRepository
                    ? `You are modifying the existing GitHub repository ${managedRepository.repositoryId} from ${managedRepository.baseRef}. Inspect and preserve the existing project; do not replace it with an unrelated scaffold.`
                    : "Build the complete project in the current isolated workspace.",
                  repositoryContext
                    ? `\n${repositoryContext.context}`
                    : "",
                ].join("\n"),
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
            costPreference: request.costPreference ?? "economy",
            maximumEstimatedCost: request.maximumEstimatedCost,
            preferExternal: !explicitModel,
            preferredProviderId: request.preferredProviderId,
            preferredModelId: request.preferredModelId,
            allowUnverifiedExplicitSelection: explicitModel,
            allowUnverifiedUnderPostExecutionVerification: !explicitModel,
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

          if (result.completed && managedRepository && this.repositoryWorkspace) {
            try {
              const publication = await this.repositoryWorkspace.publishVerified(
                missionWorkspace,
                {
                  missionId,
                  verified: true,
                  commitMessage: `K.I.N.G.S. verified build: ${task.name}`,
                },
              );

              return {
                ok: publication.published || !managedRepository.publishVerifiedChanges,
                message: publication.published
                  ? `Coding task "${taskId}" completed with project-aware build/test verification and published to GitHub branch "${publication.branch}".`
                  : `Coding task "${taskId}" completed with project-aware build/test verification. ${publication.message}`,
                diagnostics: result.failureDiagnostics,
                workspacePath: missionWorkspace,
                repository: {
                  ...repositoryResponse!,
                  published: publication.published,
                  commitSha: publication.commitSha,
                  inspectedFiles: repositoryContext?.inspectedFiles,
                },
                view: {
                  mission: next.mission,
                  plan: next.plan,
                  state: next.state,
                },
              };
            } catch (error) {
              const diagnostics =
                error instanceof Error ? error.message : String(error);
              return {
                ok: false,
                message:
                  `Coding task "${taskId}" passed real project verification, but GitHub publication failed. The verified local checkout was preserved for recovery.`,
                diagnostics,
                workspacePath: missionWorkspace,
                repository: {
                  ...repositoryResponse!,
                  published: false,
                  inspectedFiles: repositoryContext?.inspectedFiles,
                },
                view: {
                  mission: next.mission,
                  plan: next.plan,
                  state: next.state,
                },
              };
            }
          }

          return {
            ok: result.completed,
            message: result.completed
              ? `Coding task "${taskId}" completed with project-aware build/test verification.`
              : `Coding task "${taskId}" did not satisfy real completion criteria.`,
            diagnostics: result.failureDiagnostics,
            workspacePath: missionWorkspace,
            repository: repositoryResponse
              ? {
                  ...repositoryResponse,
                  inspectedFiles: repositoryContext?.inspectedFiles,
                }
              : undefined,
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
            repository: repositoryResponse,
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
