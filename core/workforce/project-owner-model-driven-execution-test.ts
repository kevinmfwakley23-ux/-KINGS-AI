import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ProjectOwnerMachineApi,
  type ProjectOwnerMissionFactory,
} from "./project-owner-machine-api";

import {
  KingsCodingMachine,
} from "./kings-coding-machine";

import {
  ModelDrivenCodingExecutionAuthority,
} from "./model-driven-coding-execution";

import {
  ModelCapabilityRegistry,
} from "./model-capability-registry";

import {
  ModelRouter,
} from "./model-routing";

import {
  ProviderAdapterRegistry,
} from "./provider-adapters";

import {
  GovernedInternalIntelligenceAdapter,
} from "./internal-intelligence-adapter";

import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "./ollama-execution-client";

import {
  OllamaIntelligenceModel,
} from "./ollama-intelligence-model";

import {
  ControlledFileEditor,
} from "./file-editor";

import {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import {
  TaskControl,
} from "./task-control";

import {
  WorkforceRegistry,
} from "./registry";

import type {
  Mission,
} from "./types";

import type {
  IntelligenceCapability,
  IntelligenceModality,
} from "./model-interface";

import type {
  MissionPlan,
} from "./mission-continuity";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
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
      sourceReferences: ["project-owner-ui"],
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
          taskIds: ["task-owner-model-driven"],
          dependencyIds: [],
          status: "active",
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

async function main(): Promise<void> {
  const root = await mkdtemp("/tmp/kings-owner-model-driven-");
  const workspace = join(root, "workspace");
  const src = join(workspace, "src");
  const verify = join(workspace, "verify.cjs");

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

    const taskControl = new TaskControl(new WorkforceRegistry());
    const machine = new KingsCodingMachine(undefined, undefined, taskControl);

    const transport: OllamaHttpTransport = {
      async post(path, body) {
        const response = await fetch("http://127.0.0.1:11434" + path, {
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
      [
        "reasoning",
        "planning",
        "coding",
        "debugging",
        "research",
        "source-inspection",
        "tool-use",
        "verification",
        "recovery",
      ],
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

    capabilityRegistry.register({
      model: model.identity,
      capabilities: [
        {
          capability: "coding",
          strength: 90,
          status: "verified",
          evidenceReferences: verificationEvidence,
        },
        {
          capability: "reasoning",
          strength: 80,
          status: "verified",
          evidenceReferences: verificationEvidence,
        },
      ],
    });

    const router = new ModelRouter(
      capabilityRegistry,
      new Map([
        [
          model.identity.modelId,
          {
            estimatedCost: 0,
            latencyMs: 1000,
            reliability: 80,
          },
        ],
      ]),
    );

    const modelDrivenCoding = new ModelDrivenCodingExecutionAuthority(
      machine,
      router,
      providers,
    );

    const missionFactory: ProjectOwnerMissionFactory = {
      create: createMission,
    };

    const api = new ProjectOwnerMachineApi(
      machine,
      missionFactory,
      modelDrivenCoding,
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
        constraints: [
          "Write only inside src.",
        ],
        acceptanceCriteria: [
          "The source file exists.",
          "The source contains KINGS_OWNER_MODEL_GREEN.",
          "The verification command succeeds.",
        ],
      },
    });

    assert(created.ok, "owner UI must create the real mission");

    const approved = await api.handle({
      action: "approve-plan",
      missionId: "owner-model-real",
    });
    assert(approved.ok, "owner UI must approve the real mission");

    const locked = await api.handle({
      action: "lock-plan",
      missionId: "owner-model-real",
    });
    assert(locked.ok, "owner UI must lock the real mission");

    const executionRequest = {
      modelRequest: {
        id: "model-request-owner-real",
        taskId: "task-owner-model-driven",
        missionId: "owner-model-real",
        messages: [
          {
            role: "system" as const,
            content:
              "Return exactly one coding proposal line followed by the complete file contents. Format: FILE: src/owner-model-proof.ts [create] then TypeScript code. Do not use markdown fences.",
          },
          {
            role: "user" as const,
            content:
              "Create a TypeScript file exporting const KINGS_OWNER_MODEL_GREEN = true;",
          },
        ],
        requiredCapabilities: [
          "coding",
          "reasoning",
        ] satisfies IntelligenceCapability[],
        inputModalities: [
          "text",
        ] satisfies IntelligenceModality[],
        outputModality: "text" as const,
        maxOutputTokens: 256,
        temperature: 0,
        allowToolProposals: false,
      },
      routing: {
        requiredCapabilities: [
          "coding",
          "reasoning",
        ] satisfies IntelligenceCapability[],
        minimumCapabilityStrength: 70,
        preferInternal: true,
        maximumEstimatedCost: 0,
      },
      machineRequest: {
        proposalParser: {
          expectedTaskId: "task-owner-model-driven",
          expectedMissionId: "owner-model-real",
          allowedPaths: ["src/owner-model-proof.ts"],
          expectedFilePaths: ["src/owner-model-proof.ts"],
          allowMultipleFiles: false,
        },
        execution: {
          id: "execution-owner-model-real",
          projectId: "owner-model-real",
          status: "ready" as const,
          steps: [
            {
              id: "task-owner-model-driven",
              language: "typescript" as const,
              operation: "create" as const,
              capabilityId: "engineering-typescript",
              sequence: 1,
            },
          ],
          currentStepId: "task-owner-model-driven",
          completedStepIds: [],
          blockedReasons: [],
        },
        step: {
          id: "task-owner-model-driven",
          language: "typescript" as const,
          operation: "create" as const,
          capabilityId: "engineering-typescript",
          sequence: 1,
        },
        workspace: {
          id: "workspace-owner-model-real",
          projectId: "owner-model-real",
          rootPath: workspace,
          allowedPaths: ["src"],
          allowedLanguages: ["typescript"],
          allowedOperations: ["create"],
          active: true,
        },
        repairStep: {
          id: "task-owner-model-driven",
          strategy: "edit" as const,
          description: "Create owner-model-proof.ts.",
          reason: "Owner console real-model integration proof.",
          required: true,
        },
        buildTestSteps: [
          {
            id: "verify-owner-model-real",
            operation: "test" as const,
            command: process.execPath,
            args: [verify],
            workingDirectory: workspace,
          },
        ],
        requiredCriteria: [
          "The source file exists.",
          "The source contains KINGS_OWNER_MODEL_GREEN.",
          "The verification command succeeds.",
        ],
      },
    };

    const editor = new EngineeringRepairEditor(
      new ControlledFileEditor({
        allowedReadPaths: [workspace],
        allowedWritePaths: [src],
        maxFileBytes: 16_384,
      }),
    );

    const result = await api.handle({
      action: "execute-next",
      missionId: "owner-model-real",
      executionRequest,
      editor,
      buildTestOptions: {
        sandboxPolicy: {
          allowedCommands: [process.execPath],
          allowedWorkingDirectories: [workspace],
          allowedReadPaths: [workspace],
          allowedWritePaths: [workspace, src],
          allowedEnvironmentKeys: [],
          allowedSideEffects: ["read", "write", "execute"],
          timeoutMs: 20_000,
          maxOutputBytes: 16_384,
          maxConcurrentProcesses: 1,
          allowShell: false,
          allowNetwork: false,
        },
      },
    });

    assert(result.ok, result.message);
    assert(
      result.view?.state.completedTaskIds.includes("task-owner-model-driven"),
      "real model coding task must be promoted to completed mission state",
    );
    const evidenceIds = result.view?.state.evidenceIds ?? [];
    assert(
      evidenceIds.length > 0,
      "real model coding must produce evidence",
    );

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
