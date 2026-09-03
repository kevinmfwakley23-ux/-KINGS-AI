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

import {
  ModelDrivenCodingExecutionAuthority,
} from "../../core/workforce/model-driven-coding-execution";

import {
  ModelCapabilityRegistry,
} from "../../core/workforce/model-capability-registry";

import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "../../core/workforce/model-routing";

import {
  ProviderAdapterRegistry,
} from "../../core/workforce/provider-adapters";

import {
  GovernedInternalIntelligenceAdapter,
} from "../../core/workforce/internal-intelligence-adapter";

import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "../../core/workforce/ollama-execution-client";

import {
  OllamaIntelligenceModel,
} from "../../core/workforce/ollama-intelligence-model";

import {
  ControlledFileEditor,
} from "../../core/workforce/file-editor";

import {
  EngineeringRepairEditor,
} from "../../core/workforce/engineering-repair-editor";

import type {
  KingsCodingMachine,
} from "../../core/workforce/kings-coding-machine";

import type {
  IntelligenceCapability,
} from "../../core/workforce/model-interface";

import type {
  Task,
} from "../../core/workforce/types";

import type {
  WorkUnitContract,
} from "../../core/workforce/work-unit-contract";

import type {
  MissionPlan,
} from "../../core/workforce/mission-continuity";

import type {
  Mission,
} from "../../core/workforce/types";

import {
  registerKingsAiGatewayRuntime,
  type KingsAiGatewayRuntime,
} from "../../core/workforce/ai-gateway-runtime";

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
}

type BuildTestOptions = ConstructorParameters<
  typeof import("../../core/workforce/coding-work-unit-execution").CodingWorkUnitExecutionAuthority
>[1];

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
    `Build the application described by the owner vision: ${input.objective}`,
    `Requirements: ${input.requirements.join(" | ")}`,
    input.preferredPlatform ? `Preferred platform: ${input.preferredPlatform}` : "",
    input.preferredLanguage ? `Preferred language: ${input.preferredLanguage}` : "",
    input.constraints.length > 0 ? `Constraints: ${input.constraints.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const task: Task = {
    id: taskId,
    missionId: input.id,
    name: `Build ${input.projectName}`,
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
    inputReferences: ["project-owner-vision"],
    expectedOutputs: [
      "Working application source code",
      "Project manifests and configuration",
      "Executable automated tests or smoke verification",
      "Passing build and verification evidence",
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
): {
  mission: Mission;
  plan: MissionPlan;
} {
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
      sourceReferences: ["project-owner-ui"],
      createdAt: now,
      updatedAt: now,
    },
    plan: {
      id: `plan-${input.id}`,
      missionId: input.id,
      version: 1,
      objective: vision.planObjective,
      milestones: [
        {
          id: vision.milestoneId,
          missionId: input.id,
          name: "Build",
          objective: vision.planObjective,
          taskIds: [vision.taskId],
          dependencyIds: [],
          status: "planned",
        },
      ],
      decisionIds: [],
      acceptanceCriteria: input.acceptanceCriteria,
      locked: false,
      approvedByHuman: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export class ProjectOwnerMachineServerController implements ProjectOwnerMachineApiHandler {
  private readonly api: ProjectOwnerMachineApi;
  private readonly editor: EngineeringRepairEditor;
  private readonly buildTestOptions: BuildTestOptions;

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

    const model = new OllamaIntelligenceModel(
      ollamaClient,
      modelId,
      capabilitiesForModel,
    );

    const adapter = new GovernedInternalIntelligenceAdapter({
      async execute(identity, request) {
        return ollamaClient.execute(identity, request);
      },
    });
    adapter.registerModel(model);

    const providers = new ProviderAdapterRegistry();
    providers.register(adapter);

    const capabilities = new ModelCapabilityRegistry();
    capabilities.register({
      model: model.identity,
      capabilities: capabilitiesForModel.map((capability) => ({
        capability,
        strength: capability === "coding" ? 90 : 82,
        status: "verified" as const,
        evidenceReferences: ["real-local-1.5b-acceptance"],
        verifiedAt: new Date().toISOString(),
      })),
    });

    const metrics = new Map<string, ModelRoutingMetrics>();
    metrics.set(
      modelRoutingMetricKey(
        model.identity.providerId,
        model.identity.modelId,
      ),
      { estimatedCost: 0, latencyMs: 1000, reliability: 85 },
    );

    if (runtime.gatewayRuntime) {
      registerKingsAiGatewayRuntime(
        runtime.gatewayRuntime,
        providers,
        capabilities,
        metrics,
      );
    }

    const router = new ModelRouter(
      capabilities,
      metrics,
    );

    const modelDrivenCoding = new ModelDrivenCodingExecutionAuthority(
      machine,
      router,
      providers,
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
    if (allowBuildNetwork) {
      allowedSideEffects.push("network");
    }

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
      },
    };

    this.api = new ProjectOwnerMachineApi(
      machine,
      missionFactory,
      modelDrivenCoding,
      executionContext,
      new ProjectOwnerUiController(),
      workspaceRoot,
    );
  }

  handle(
    request: ProjectOwnerMachineApiRequest,
  ): Promise<ProjectOwnerMachineApiResponse> {
    if (request.action !== "execute-next") {
      return this.api.handle(request);
    }

    return this.api.handle({
      ...request,
      editor: request.editor ?? this.editor,
      buildTestOptions: request.buildTestOptions ?? this.buildTestOptions,
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
