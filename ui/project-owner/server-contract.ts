import {
  ProjectOwnerMachineApi,
  type ProjectOwnerMachineApiRequest,
  type ProjectOwnerMachineApiResponse,
  type ProjectOwnerMissionFactory,
  type ProjectOwnerExecutionContext,
} from "../../core/workforce/project-owner-machine-api";
import {
  ProjectOwnerUiController,
  type ProjectOwnerDesignInput,
} from "../../core/workforce/project-owner-ui-contract";
import { ModelDrivenCodingExecutionAuthority } from "../../core/workforce/model-driven-coding-execution";
import { ModelCapabilityRegistry } from "../../core/workforce/model-capability-registry";
import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "../../core/workforce/model-routing";
import { ProviderAdapterRegistry } from "../../core/workforce/provider-adapters";
import { GovernedInternalIntelligenceAdapter } from "../../core/workforce/internal-intelligence-adapter";
import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "../../core/workforce/ollama-execution-client";
import { OllamaIntelligenceModel } from "../../core/workforce/ollama-intelligence-model";
import { ControlledFileEditor } from "../../core/workforce/file-editor";
import { EngineeringRepairEditor } from "../../core/workforce/engineering-repair-editor";
import type { KingsCodingMachine } from "../../core/workforce/kings-coding-machine";
import type { IntelligenceCapability } from "../../core/workforce/model-interface";
import type { Mission, Task } from "../../core/workforce/types";
import type { WorkUnitContract } from "../../core/workforce/work-unit-contract";
import type { MissionPlan } from "../../core/workforce/mission-continuity";
import type {
  SandboxBubblewrapIsolation,
} from "../../core/workforce/execution-sandbox";
import {
  registerKingsAiGatewayRuntime,
  synchronizeKingsAiGatewayRuntime,
  type KingsAiGatewayRuntime,
  type KingsGatewayRuntimeSynchronization,
} from "../../core/workforce/ai-gateway-runtime";
import {
  GitHubRepositoryWorkspaceAuthority,
} from "../../core/workforce/github-repository-workspace";

export interface ProjectOwnerMachineApiHandler {
  handle(
    request: ProjectOwnerMachineApiRequest,
  ): Promise<ProjectOwnerMachineApiResponse>;
}

export interface ProjectOwnerRuntimeOptions {
  ollamaBaseUrl?: string;
  modelId?: string;
  workspaceRoot?: string;
  gatewayRuntime?: KingsAiGatewayRuntime;
  allowBuildNetwork?: boolean;
  localModelAvailable?: boolean;
  processIsolation?: SandboxBubblewrapIsolation;
}

type BuildTestOptions = ConstructorParameters<
  typeof import("../../core/workforce/coding-work-unit-execution").CodingWorkUnitExecutionAuthority
>[1];

function detectGitHubRepository(
  input: ProjectOwnerDesignInput,
): ProjectOwnerDesignInput {
  if (input.repository) return input;

  const searchable = [
    input.objective,
    ...input.requirements,
    ...input.constraints,
  ].join("\n");
  const match = searchable.match(
    /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?/i,
  );
  if (!match) return input;

  return {
    ...input,
    repository: {
      url: match[0],
      publishVerifiedChanges: true,
    },
  };
}

function createVisionTask(
  input: ProjectOwnerDesignInput,
  now: string,
): {
  task: Task;
  workUnit: WorkUnitContract;
  planObjective: string;
  taskId: string;
  milestoneId: string;
} {
  const taskId = `task-${input.id}-build`;
  const milestoneId = `milestone-${input.id}`;
  const objective = [
    input.repository
      ? `Inspect and modify the existing GitHub repository ${input.repository.url}: ${input.objective}`
      : `Build the application described by the owner vision: ${input.objective}`,
    `Requirements: ${input.requirements.join(" | ")}`,
    input.repository?.baseRef ? `Repository base ref: ${input.repository.baseRef}` : "",
    input.preferredPlatform ? `Preferred platform: ${input.preferredPlatform}` : "",
    input.preferredLanguage ? `Preferred language: ${input.preferredLanguage}` : "",
    input.constraints.length > 0 ? `Constraints: ${input.constraints.join(" | ")}` : "",
  ].filter(Boolean).join(" ");

  const task: Task = {
    id: taskId,
    missionId: input.id,
    name: input.repository
      ? `Build ${input.projectName} from GitHub repository`
      : `Build ${input.projectName}`,
    description: objective,
    requiredCapabilities: [
      "reasoning",
      "planning",
      "coding",
      "debugging",
      "source-inspection",
      "verification",
      "recovery",
    ],
    requiredToolIds: ["tool-execution-sandbox"],
    status: "ready",
    dependencyIds: [],
    inputReferences: input.repository
      ? ["project-owner-vision", input.repository.url]
      : ["project-owner-vision"],
    expectedOutputs: [
      "Working application source code",
      "Project manifests and configuration",
      "Executable automated tests or smoke verification",
      "Passing build and verification evidence",
      ...(input.repository
        ? ["Verified GitHub work-branch commit"]
        : []),
    ],
    createdAt: now,
    updatedAt: now,
  };

  const workUnit: WorkUnitContract = {
    id: `work-unit-${input.id}-build`,
    role: "coding-engineer",
    objective,
    capabilityIds: ["engineering-project"],
    allowedToolIds: ["tool-execution-sandbox"],
    allowedPaths: ["."],
    budget: {
      maxTimeMs: 300_000,
      maxTokens: 16_000,
      maxIterations: 5,
    },
    dependencyIds: [],
    acceptanceCriteria: input.acceptanceCriteria,
    requiredEvidenceTypes: ["write", "command", "verification"],
    approved: true,
    createdAt: now,
    updatedAt: now,
  };

  return {
    task,
    workUnit,
    planObjective: input.objective,
    taskId,
    milestoneId,
  };
}

function buildMissionFromVision(
  input: ProjectOwnerDesignInput,
  registry: import("../../core/workforce/registry").WorkforceRegistry,
  workUnits: import("../../core/workforce/work-unit-registry").WorkUnitRegistry,
): { mission: Mission; plan: MissionPlan } {
  const now = new Date().toISOString();
  const vision = createVisionTask(input, now);
  registry.registerTask(vision.task);
  workUnits.register(vision.task.id, vision.workUnit);

  return {
    mission: {
      id: input.id,
      name: input.projectName,
      description: input.objective,
      status: "planned",
      objectives: [input.objective],
      sourceReferences: input.repository
        ? ["project-owner-ui", input.repository.url]
        : ["project-owner-ui"],
      createdAt: now,
      updatedAt: now,
    },
    plan: {
      id: `plan-${input.id}`,
      missionId: input.id,
      version: 1,
      objective: vision.planObjective,
      milestones: [{
        id: vision.milestoneId,
        missionId: input.id,
        name: "Build",
        objective: vision.planObjective,
        taskIds: [vision.taskId],
        dependencyIds: [],
        status: "planned",
      }],
      decisionIds: [],
      acceptanceCriteria: input.acceptanceCriteria,
      locked: false,
      approvedByHuman: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export class ProjectOwnerMachineServerController
  implements ProjectOwnerMachineApiHandler {
  private readonly api: ProjectOwnerMachineApi;
  private readonly editor: EngineeringRepairEditor;
  private readonly buildTestOptions: BuildTestOptions;
  private readonly providers = new ProviderAdapterRegistry();
  private readonly capabilities = new ModelCapabilityRegistry();
  private readonly metrics = new Map<string, ModelRoutingMetrics>();
  private readonly localModel: OllamaIntelligenceModel;
  private readonly localAdapter: GovernedInternalIntelligenceAdapter;
  private readonly localMetricKey: string;

  constructor(
    machine: KingsCodingMachine,
    missionFactory: ProjectOwnerMissionFactory,
    executionContext: ProjectOwnerExecutionContext,
    runtime: ProjectOwnerRuntimeOptions = {},
  ) {
    const modelId = runtime.modelId ?? "qwen2.5-coder:1.5b";
    const baseUrl = runtime.ollamaBaseUrl ?? "http://127.0.0.1:11434";
    const workspaceRoot = runtime.workspaceRoot ?? process.cwd();
    const allowBuildNetwork = runtime.allowBuildNetwork ?? true;
    const localModelAvailable = runtime.localModelAvailable ?? true;

    const transport: OllamaHttpTransport = {
      async post(path, body) {
        const response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
        }
        return response.json();
      },
    };

    const ollamaClient = new HttpOllamaExecutionClient(transport);
    const capabilitiesForModel: IntelligenceCapability[] = [
      "reasoning",
      "planning",
      "coding",
      "debugging",
      "source-inspection",
      "verification",
      "recovery",
    ];
    this.localModel = new OllamaIntelligenceModel(
      ollamaClient,
      modelId,
      capabilitiesForModel,
      localModelAvailable,
    );
    this.localAdapter = new GovernedInternalIntelligenceAdapter({
      async execute(identity, request) {
        return ollamaClient.execute(identity, request);
      },
    });
    this.localAdapter.descriptor.available = localModelAvailable;
    this.localAdapter.registerModel(this.localModel);
    this.providers.register(this.localAdapter);

    this.capabilities.register({
      model: this.localModel.identity,
      capabilities: capabilitiesForModel.map((capability) => ({
        capability,
        strength: capability === "coding" ? 80 : 74,
        status: "unverified" as const,
        evidenceReferences: ["local-model-runtime-registration"],
      })),
    });

    this.localMetricKey = modelRoutingMetricKey(
      this.localModel.identity.providerId,
      this.localModel.identity.modelId,
    );
    this.metrics.set(
      this.localMetricKey,
      {
        estimatedCost: 0,
        costBasis: "configured-estimate",
        latencyMs: 1_000,
        reliability: localModelAvailable ? 85 : 20,
      },
    );

    if (runtime.gatewayRuntime) {
      registerKingsAiGatewayRuntime(
        runtime.gatewayRuntime,
        this.providers,
        this.capabilities,
        this.metrics,
      );
    }

    const router = new ModelRouter(this.capabilities, this.metrics);
    const modelDrivenCoding = new ModelDrivenCodingExecutionAuthority(
      machine,
      router,
      this.providers,
    );

    this.editor = new EngineeringRepairEditor(
      new ControlledFileEditor({
        allowedReadPaths: [workspaceRoot],
        allowedWritePaths: [workspaceRoot],
        maxFileBytes: 5_242_880,
      }),
    );

    const allowedSideEffects: Array<"read" | "write" | "execute" | "network"> = [
      "read",
      "write",
      "execute",
    ];
    if (allowBuildNetwork) allowedSideEffects.push("network");

    this.buildTestOptions = {
      sandboxPolicy: {
        allowedCommands: [
          process.execPath,
          "node",
          "npm",
          "npx",
          "python3",
          "cargo",
          "go",
          "mvn",
          "gradle",
          "javac",
          "java",
          "gcc",
          "g++",
          "make",
          "cmake",
          "bash",
          "sqlite3",
        ],
        allowedWorkingDirectories: [workspaceRoot],
        allowedReadPaths: [workspaceRoot],
        allowedWritePaths: [workspaceRoot],
        allowedEnvironmentKeys: [
          "PATH",
          "HOME",
          "TMPDIR",
          "TMP",
          "TEMP",
          "CI",
          "NODE_ENV",
        ],
        allowedSideEffects,
        timeoutMs: 300_000,
        maxOutputBytes: 524_288,
        maxConcurrentProcesses: 1,
        allowShell: false,
        allowNetwork: allowBuildNetwork,
        processIsolation: runtime.processIsolation,
      },
    };

    this.api = new ProjectOwnerMachineApi(
      machine,
      missionFactory,
      modelDrivenCoding,
      executionContext,
      new ProjectOwnerUiController(),
      workspaceRoot,
      new GitHubRepositoryWorkspaceAuthority(),
    );
  }

  setLocalModelAvailability(available: boolean): void {
    this.localModel.identity.available = available;
    this.localAdapter.descriptor.available = available;
    this.metrics.set(
      this.localMetricKey,
      {
        estimatedCost: 0,
        costBasis: "configured-estimate",
        latencyMs: 1_000,
        reliability: available ? 85 : 20,
      },
    );
  }

  synchronizeGatewayRuntime(
    runtime: KingsAiGatewayRuntime,
  ): KingsGatewayRuntimeSynchronization {
    return synchronizeKingsAiGatewayRuntime(
      runtime,
      this.providers,
      this.capabilities,
      this.metrics,
    );
  }

  hasProcessIsolation(): boolean {
    return this.buildTestOptions.sandboxPolicy.processIsolation?.kind === "bubblewrap";
  }

  async handle(
    request: ProjectOwnerMachineApiRequest,
  ): Promise<ProjectOwnerMachineApiResponse> {
    const normalizedRequest =
      request.action === "create-mission" && request.input
        ? {
            ...request,
            input: detectGitHubRepository(request.input),
          }
        : request;

    if (normalizedRequest.action !== "execute-next") {
      return this.api.handle(normalizedRequest);
    }

    if (!this.hasProcessIsolation() && normalizedRequest.missionId) {
      const snapshot = await this.api.handle({
        action: "snapshot",
        missionId: normalizedRequest.missionId,
      });
      if (snapshot.repository) {
        return {
          ...snapshot,
          ok: false,
          message:
            "GitHub repository execution is blocked because Linux host process isolation is unavailable. Install/configure Bubblewrap on the Chromebook, then refresh the K.I.N.G.S. runtime; repository build/test code will not run directly against the host filesystem.",
        };
      }
    }

    return this.api.handle({
      ...normalizedRequest,
      editor: normalizedRequest.editor ?? this.editor,
      buildTestOptions:
        normalizedRequest.buildTestOptions ?? this.buildTestOptions,
    });
  }
}

export function createProjectOwnerMissionRequest(
  input: ProjectOwnerDesignInput,
): ProjectOwnerMachineApiRequest {
  return {
    action: "create-mission",
    input,
  };
}

export function createDefaultProjectOwnerMissionFactory(
  registry: import("../../core/workforce/registry").WorkforceRegistry,
  workUnits: import("../../core/workforce/work-unit-registry").WorkUnitRegistry,
): ProjectOwnerMissionFactory {
  return {
    create(input) {
      return buildMissionFromVision(input, registry, workUnits);
    },
  };
}
