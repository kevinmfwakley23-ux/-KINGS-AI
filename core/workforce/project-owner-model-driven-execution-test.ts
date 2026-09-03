import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";

import {
  ProjectOwnerMachineApi,
  type ProjectOwnerMissionFactory,
  type ProjectOwnerExecutionContext,
} from "./project-owner-machine-api";
import { KingsCodingMachine } from "./kings-coding-machine";
import { ModelDrivenCodingExecutionAuthority } from "./model-driven-coding-execution";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { GovernedInternalIntelligenceAdapter } from "./internal-intelligence-adapter";
import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "./ollama-execution-client";
import { OllamaIntelligenceModel } from "./ollama-intelligence-model";
import {
  configuredGatewayDefinitions,
  loadKingsAiGatewayRuntime,
  registerKingsAiGatewayRuntime,
} from "./ai-gateway-runtime";
import { ControlledFileEditor } from "./file-editor";
import { EngineeringRepairEditor } from "./engineering-repair-editor";
import { TaskControl } from "./task-control";
import { WorkforceRegistry } from "./registry";
import { WorkUnitRegistry } from "./work-unit-registry";
import type {
  IntelligenceCapability,
} from "./model-interface";
import type { Mission, Task } from "./types";
import type { MissionPlan } from "./mission-continuity";
import type { WorkUnitContract } from "./work-unit-contract";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const missionId = "owner-model-real";
const taskId = "task-owner-model-driven";
const acceptanceCriteria = [
  "The generated project files exist.",
  "The project builds successfully.",
  "Automated tests prove KINGS_OWNER_MODEL_GREEN is true.",
];
const liveCapabilities: IntelligenceCapability[] = [
  "reasoning",
  "planning",
  "coding",
  "debugging",
  "research",
  "source-inspection",
  "tool-use",
  "verification",
  "recovery",
];

interface LiveRoutingRuntime {
  providers: ProviderAdapterRegistry;
  router: ModelRouter;
  preferredProviderId: string;
  preferredModelId: string;
  description: string;
}

function createTask(ownerMissionId: string): Task {
  const now = new Date().toISOString();
  return {
    id: taskId,
    missionId: ownerMissionId,
    name: "Owner model-driven build",
    description:
      "Create a zero-dependency Node project and prove its exported value with executable build and test commands.",
    requiredCapabilities: ["coding"],
    requiredToolIds: ["tool-execution-sandbox"],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "generated project files",
      "successful build evidence",
      "successful behavior-test evidence",
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function createWorkUnit(): WorkUnitContract {
  const now = new Date().toISOString();
  return {
    id: "work-unit-owner-model-driven",
    role: "coding-engineer",
    objective: [
      "Build a complete zero-dependency Node.js project.",
      "Create package.json with real build and test scripts.",
      "Create src/owner-model-proof.js exporting KINGS_OWNER_MODEL_GREEN as true.",
      "Create an automated test that loads the source and fails unless KINGS_OWNER_MODEL_GREEN is true.",
      "Do not use external dependencies, mocks, TODOs, placeholder tests, or fake-success markers.",
    ].join(" "),
    capabilityIds: ["coding"],
    allowedToolIds: ["tool-execution-sandbox"],
    allowedPaths: ["."],
    budget: {
      maxTimeMs: 120_000,
      maxTokens: 4_096,
      maxIterations: 3,
    },
    dependencyIds: [],
    acceptanceCriteria: [...acceptanceCriteria],
    requiredEvidenceTypes: ["write", "test"],
    approved: true,
    createdAt: now,
    updatedAt: now,
  };
}

function createMission(
  input: Parameters<ProjectOwnerMissionFactory["create"]>[0],
): { mission: Mission; plan: MissionPlan } {
  const now = new Date().toISOString();
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
      objective: input.objective,
      milestones: [{
        id: `milestone-${input.id}`,
        missionId: input.id,
        name: "Build",
        objective: input.objective,
        taskIds: [taskId],
        dependencyIds: [],
        status: "active",
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

async function createLiveRoutingRuntime(): Promise<LiveRoutingRuntime> {
  const providers = new ProviderAdapterRegistry();
  const capabilityRegistry = new ModelCapabilityRegistry();
  const metrics = new Map<string, ModelRoutingMetrics>();

  if (configuredGatewayDefinitions(process.env).length > 0) {
    const gatewayRuntime = await loadKingsAiGatewayRuntime();
    registerKingsAiGatewayRuntime(
      gatewayRuntime,
      providers,
      capabilityRegistry,
      metrics,
    );

    const requestedProvider = process.env.KINGS_LIVE_PROVIDER_ID?.trim();
    const requestedModel = process.env.KINGS_LIVE_MODEL_ID?.trim();
    const eligible = gatewayRuntime.catalog.filter((entry) =>
      entry.codingEligible &&
      (!requestedProvider || entry.providerId === requestedProvider) &&
      (!requestedModel || entry.modelId === requestedModel)
    );

    const selected =
      eligible.find((entry) => entry.verifiedCodingRoute) ?? eligible[0];

    if (!selected) {
      const discovered = gatewayRuntime.catalog
        .filter((entry) => entry.codingEligible)
        .map((entry) => `${entry.providerId}/${entry.modelId}`)
        .join(", ");
      throw new Error(
        "K.I.N.G.S. live provider acceptance could not select a coding model. " +
        `Requested provider=${requestedProvider ?? "auto"}, model=${requestedModel ?? "auto"}. ` +
        `Eligible catalog routes: ${discovered || "none"}.`,
      );
    }

    return {
      providers,
      router: new ModelRouter(capabilityRegistry, metrics),
      preferredProviderId: selected.providerId,
      preferredModelId: selected.modelId,
      description: `${selected.gatewayKind}:${selected.providerId}/${selected.modelId}`,
    };
  }

  const transport: OllamaHttpTransport = {
    async post(path, body) {
      const response = await fetch(`http://127.0.0.1:11434${path}`, {
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
  const modelId =
    process.env.KINGS_LIVE_OLLAMA_MODEL?.trim() || "qwen2.5-coder:1.5b";
  const model = new OllamaIntelligenceModel(
    ollamaClient,
    modelId,
    liveCapabilities,
  );
  const internalAdapter = new GovernedInternalIntelligenceAdapter({
    async execute(identity, request) {
      return ollamaClient.execute(identity, request);
    },
  });
  internalAdapter.registerModel(model);
  providers.register(internalAdapter);

  capabilityRegistry.register({
    model: model.identity,
    capabilities: liveCapabilities.map((capability) => ({
      capability,
      strength: capability === "coding" ? 90 : 80,
      status: "verified" as const,
      evidenceReferences: ["live-local-ollama-acceptance"],
      verifiedAt: new Date().toISOString(),
    })),
  });
  metrics.set(
    modelRoutingMetricKey(model.identity.providerId, model.identity.modelId),
    { estimatedCost: 0, latencyMs: 1_000, reliability: 80 },
  );

  return {
    providers,
    router: new ModelRouter(capabilityRegistry, metrics),
    preferredProviderId: model.identity.providerId,
    preferredModelId: model.identity.modelId,
    description: `ollama:${model.identity.providerId}/${model.identity.modelId}`,
  };
}

async function main(): Promise<void> {
  const root = await mkdtemp("/tmp/kings-owner-model-driven-");
  const projectsRoot = join(root, "projects");
  const missionWorkspace = join(projectsRoot, missionId);

  try {
    const registry = new WorkforceRegistry();
    const workUnitRegistry = new WorkUnitRegistry();
    const task = createTask(missionId);
    const workUnit = createWorkUnit();
    registry.registerTask(task);
    workUnitRegistry.register(taskId, workUnit);

    const taskControl = new TaskControl(registry);
    const machine = new KingsCodingMachine(
      undefined,
      undefined,
      taskControl,
      workUnitRegistry,
    );

    const live = await createLiveRoutingRuntime();
    const modelDrivenCoding = new ModelDrivenCodingExecutionAuthority(
      machine,
      live.router,
      live.providers,
    );
    const missionFactory: ProjectOwnerMissionFactory = { create: createMission };
    const executionContext: ProjectOwnerExecutionContext = {
      getTask: (id) => registry.getTask(id),
      getWorkUnit: (id) => workUnitRegistry.get(id) ?? (() => {
        throw new Error(`Missing registered work unit: ${id}`);
      })(),
    };

    const api = new ProjectOwnerMachineApi(
      machine,
      missionFactory,
      modelDrivenCoding,
      executionContext,
      undefined,
      projectsRoot,
    );

    const created = await api.handle({
      action: "create-mission",
      input: {
        id: missionId,
        projectName: "Owner Model Real Build",
        objective:
          "Build and independently verify a zero-dependency Node.js project from a typed owner request.",
        requirements: [
          "Create package.json with zero dependencies and real build and test scripts.",
          "Create src/owner-model-proof.js exporting KINGS_OWNER_MODEL_GREEN as true.",
          "Create an automated behavior test that fails unless that exported value is true.",
        ],
        preferredPlatform: "Linux",
        preferredLanguage: "JavaScript",
        constraints: [
          "Write only inside the isolated mission workspace.",
          "Use no external dependencies.",
        ],
        acceptanceCriteria: [...acceptanceCriteria],
      },
    });

    assert(created.ok, "owner UI must create the real mission");
    assert(
      created.workspacePath === missionWorkspace,
      `owner API workspace must equal governed editor workspace: ${created.workspacePath}`,
    );
    assert(
      (created.view?.plan.milestones.flatMap((milestone) => milestone.taskIds) ?? [])
        .includes(taskId),
      "real model task must be present in the mission plan",
    );

    const approved = await api.handle({
      action: "approve-plan",
      missionId,
    });
    assert(approved.ok, "owner UI must approve the real mission");

    const locked = await api.handle({
      action: "lock-plan",
      missionId,
    });
    assert(locked.ok, "owner UI must lock the real mission");

    const result = await api.handle({
      action: "execute-next",
      missionId,
      preferredProviderId: live.preferredProviderId,
      preferredModelId: live.preferredModelId,
      editor: new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [missionWorkspace],
          allowedWritePaths: [missionWorkspace],
          maxFileBytes: 256_000,
        }),
      ),
      buildTestOptions: {
        sandboxPolicy: {
          allowedCommands: [process.execPath, "node", "npm", "npx"],
          allowedWorkingDirectories: [missionWorkspace],
          allowedReadPaths: [missionWorkspace],
          allowedWritePaths: [missionWorkspace],
          allowedEnvironmentKeys: ["PATH", "HOME"],
          allowedSideEffects: ["read", "write", "execute"],
          timeoutMs: 60_000,
          maxOutputBytes: 65_536,
          maxConcurrentProcesses: 1,
          allowShell: false,
          allowNetwork: false,
        },
      },
    });

    assert(
      result.ok,
      `${result.message}${result.diagnostics ? `\n${result.diagnostics}` : ""}`,
    );
    assert(
      result.view?.state.completedTaskIds.includes(taskId),
      "real model coding task must be promoted to completed mission state",
    );
    assert(
      (result.view?.state.evidenceIds.length ?? 0) > 0,
      "real model coding must produce durable mission evidence",
    );

    const source = await readFile(
      join(missionWorkspace, "src", "owner-model-proof.js"),
      "utf8",
    );
    assert(
      source.includes("KINGS_OWNER_MODEL_GREEN"),
      "generated source must contain KINGS_OWNER_MODEL_GREEN",
    );

    console.log(`K.I.N.G.S. LIVE ROUTE → ${live.description}: SUCCESS`);
    console.log("K.I.N.G.S. OWNER API → SHARED GOVERNED WORKSPACE: SUCCESS");
    console.log("K.I.N.G.S. LIVE MODEL → REAL BUILD + TEST: SUCCESS");
    console.log("K.I.N.G.S. LIVE MODEL → VERIFIED COMPLETION: SUCCESS");
    console.log("TREE-KCM-OWNER-PROVIDER-NEUTRAL-LIVE: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-PROVIDER-NEUTRAL-LIVE: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
