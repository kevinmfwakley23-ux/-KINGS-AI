import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  ProjectOwnerMachineApi,
  type ProjectOwnerMissionFactory,
  type ProjectOwnerExecutionContext,
} from "./project-owner-machine-api";

import { KingsCodingMachine } from "./kings-coding-machine";
import { ModelDrivenCodingExecutionAuthority } from "./model-driven-coding-execution";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import { ModelRouter } from "./model-routing";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { GovernedInternalIntelligenceAdapter } from "./internal-intelligence-adapter";
import { HttpOllamaExecutionClient, type OllamaHttpTransport } from "./ollama-execution-client";
import { OllamaIntelligenceModel } from "./ollama-intelligence-model";
import { ControlledFileEditor } from "./file-editor";
import { EngineeringRepairEditor } from "./engineering-repair-editor";
import { TaskControl } from "./task-control";
import { WorkforceRegistry } from "./registry";
import { WorkUnitRegistry } from "./work-unit-registry";
import type { Mission, Task } from "./types";
import type { MissionPlan } from "./mission-continuity";
import type { WorkUnitContract } from "./work-unit-contract";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const taskId = "task-owner-model-driven";

function createTask(missionId: string): Task {
  const now = new Date().toISOString();
  return {
    id: taskId,
    missionId,
    name: "Owner model-driven build",
    description: "Create and verify the owner model-driven source file.",
    requiredCapabilities: ["coding"],
    requiredToolIds: ["tool-execution-sandbox"],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: ["verified source file", "verification evidence"],
    createdAt: now,
    updatedAt: now,
  };
}

function createWorkUnit(): WorkUnitContract {
  const now = new Date().toISOString();
  return {
    id: "work-unit-owner-model-driven",
    role: "coding-engineer",
    objective: "Create and verify the owner model-driven source file.",
    capabilityIds: ["coding"],
    allowedToolIds: ["tool-execution-sandbox"],
    allowedPaths: ["."],
    budget: {
      maxTimeMs: 30_000,
      maxTokens: 1_000,
      maxIterations: 2,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "The source file exists.",
      "The source contains KINGS_OWNER_MODEL_GREEN.",
      "The verification command succeeds.",
    ],
    requiredEvidenceTypes: ["command"],
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

async function main(): Promise<void> {
  const root = await mkdtemp("/tmp/kings-owner-model-driven-");
  const workspace = `${root}/workspace`;
  const src = `${workspace}/src`;
  const verify = `${workspace}/verify.cjs`;

  try {
    await mkdir(src, { recursive: true });

    await writeFile(
      verify,
      [
        "const fs = require('node:fs');",
        "const value = fs.readFileSync('src/owner-model-proof.ts', 'utf8');",
        "if (!value.includes('KINGS_OWNER_MODEL_GREEN')) process.exit(2);",
        "console.log('KINGS_OWNER_MODEL_GREEN');",
      ].join("\n"),
      "utf8",
    );

    const registry = new WorkforceRegistry();
    const workUnitRegistry = new WorkUnitRegistry();
    const task = createTask("owner-model-real");
    const workUnit = createWorkUnit();
    registry.registerTask(task);
    workUnitRegistry.register(taskId, workUnit);

    const taskControl = new TaskControl(registry);
    const machine = new KingsCodingMachine(undefined, undefined, taskControl, workUnitRegistry);

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
    const model = new OllamaIntelligenceModel(
      ollamaClient,
      "qwen2.5-coder:1.5b",
      ["reasoning", "planning", "coding", "debugging", "research", "source-inspection", "tool-use", "verification", "recovery"],
    );

    const internalAdapter = new GovernedInternalIntelligenceAdapter({
      async execute(identity, request) {
        return ollamaClient.execute(identity, request);
      },
    });
    internalAdapter.registerModel(model);

    const providers = new ProviderAdapterRegistry();
    providers.register(internalAdapter);

    const capabilityRegistry = new ModelCapabilityRegistry();
    const verificationEvidence = ["owner-model-real"];
    const verifiedCapabilities = [
      "reasoning",
      "planning",
      "coding",
      "debugging",
      "research",
      "source-inspection",
      "tool-use",
      "verification",
      "recovery",
    ] as const;

    capabilityRegistry.register({
      model: model.identity,
      capabilities: verifiedCapabilities.map((capability) => ({
        capability,
        strength: capability === "coding" ? 90 : 80,
        status: "verified" as const,
        evidenceReferences: verificationEvidence,
      })),
    });

    const router = new ModelRouter(
      capabilityRegistry,
      new Map([[model.identity.modelId, { estimatedCost: 0, latencyMs: 1000, reliability: 80 }]]),
    );

    const modelDrivenCoding = new ModelDrivenCodingExecutionAuthority(machine, router, providers);
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
    );

    const created = await api.handle({
      action: "create-mission",
      input: {
        id: "owner-model-real",
        projectName: "Owner Model Real Build",
        objective: "Create a verified TypeScript source file from a typed owner request.",
        requirements: [
          "Create src/owner-model-proof.ts.",
          "Export KINGS_OWNER_MODEL_GREEN as true.",
        ],
        preferredPlatform: "Linux",
        preferredLanguage: "TypeScript",
        constraints: ["Write only inside src."],
        acceptanceCriteria: [
          "The source file exists.",
          "The source contains KINGS_OWNER_MODEL_GREEN.",
          "The verification command succeeds.",
        ],
      },
    });

    assert(created.ok, "owner UI must create the real mission");
    assert((created.view?.plan.milestones.flatMap((milestone) => milestone.taskIds) ?? []).includes(taskId), "real model task must be present in the mission plan");

    const approved = await api.handle({ action: "approve-plan", missionId: "owner-model-real" });
    assert(approved.ok, "owner UI must approve the real mission");

    const locked = await api.handle({ action: "lock-plan", missionId: "owner-model-real" });
    assert(locked.ok, "owner UI must lock the real mission");

    const result = await api.handle({
      action: "execute-next",
      missionId: "owner-model-real",
      editor: new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [workspace],
          allowedWritePaths: [src],
          maxFileBytes: 16_384,
        }),
      ),
      buildTestOptions: {
        sandboxPolicy: {
          allowedCommands: [process.execPath],
          allowedWorkingDirectories: [workspace],
          allowedReadPaths: [workspace],
          allowedWritePaths: [workspace, src],
          allowedEnvironmentKeys: ["PATH"],
          allowedSideEffects: ["read", "write", "execute"],
          timeoutMs: 20_000,
          maxOutputBytes: 16_384,
          maxConcurrentProcesses: 1,
          allowShell: false,
          allowNetwork: false,
        },
      },
    });

    assert(result.ok, `${result.message}${result.diagnostics ? `\n${result.diagnostics}` : ""}`);
    assert(
      result.view?.state.completedTaskIds.includes(taskId),
      "real model coding task must be promoted to completed mission state",
    );
    assert((result.view?.state.evidenceIds.length ?? 0) > 0, "real model coding must produce evidence");

    console.log("K.I.N.G.S. OWNER UI → REAL LOCAL MODEL: SUCCESS");
    console.log("K.I.N.G.S. REAL MODEL → GOVERNED CODING: SUCCESS");
    console.log("K.I.N.G.S. REAL MODEL → VERIFIED COMPLETION: SUCCESS");
    console.log("TREE-KCM-OWNER-REAL-MODEL: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-REAL-MODEL: FAILURE");
  console.error(error);
  process.exitCode = 1;
});