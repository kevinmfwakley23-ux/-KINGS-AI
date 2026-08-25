import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import type {
  IntelligenceCapability,
  ModelExecutionRequest,
} from "./model-interface";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import { ModelRouter } from "./model-routing";
import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "./ollama-execution-client";
import { OllamaIntelligenceModel } from "./ollama-intelligence-model";
import { GovernedInternalIntelligenceAdapter } from "./internal-intelligence-adapter";
import { InternalModelExecutionPort } from "./internal-model-execution-port";
import { ModelCodingProposalParser } from "./model-coding-proposal-parser";
import { GovernedLocalCodingProposal } from "./local-coding-change-proposal";
import { EngineeringWorkspaceAuthority } from "./engineering-workspace";
import { EngineeringWorkspaceProposalAuthority } from "./engineering-workspace-proposal";
import { ControlledFileEditor } from "./file-editor";
import { EngineeringRepairEditor } from "./engineering-repair-editor";
import { BuildTestExecutor } from "./build-test-executor";
import type { WorkUnitContract } from "./work-unit-contract";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function resolveTypeScriptCompiler(): string {
  try {
    const resolved = execFileSync(
      process.execPath,
      [
        "-e",
        'process.stdout.write(require.resolve("typescript/bin/tsc"))',
      ],
      {
        encoding: "utf8",
      },
    ).trim();

    if (resolved) {
      return resolved;
    }
  } catch {
    // Fall through to PATH-based resolution below.
  }

  try {
    const resolved = execFileSync(
      "bash",
      ["-lc", "command -v tsc"],
      {
        encoding: "utf8",
      },
    ).trim();

    if (resolved) {
      return resolved;
    }
  } catch {
    // No compiler resolution available.
  }

  throw new Error(
    "TypeScript compiler could not be resolved from the running Node environment or PATH.",
  );
}

async function main(): Promise<void> {
  const root = await mkdtemp("/tmp/kings-1.5b-acceptance-");
  const workspaceRoot = join(root, "workspace");
  const allowedRoot = join(workspaceRoot, "src");
  const targetPath = "src/generated.ts";
  const targetAbsolute = join(workspaceRoot, targetPath);

  try {
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

    const client = new HttpOllamaExecutionClient(transport);
    const model = new OllamaIntelligenceModel(client, "qwen2.5-coder:1.5b", [
      "reasoning",
      "planning",
      "coding",
      "debugging",
      "source-inspection",
      "verification",
      "recovery",
    ]);

    const adapter = new GovernedInternalIntelligenceAdapter({
      async execute(identity, request) {
        return client.execute(identity, request);
      },
    });
    adapter.registerModel(model);

    const providers = new ProviderAdapterRegistry();
    providers.register(adapter);

    const capabilities = new ModelCapabilityRegistry();
    const verifiedCapabilities: IntelligenceCapability[] = [
      "reasoning",
      "planning",
      "coding",
      "debugging",
      "source-inspection",
      "verification",
      "recovery",
    ];

    capabilities.register({
      model: model.identity,
      capabilities: verifiedCapabilities.map((capability) => ({
        capability,
        strength: capability === "coding" ? 90 : 82,
        status: "verified" as const,
        evidenceReferences: ["real-local-1.5b-acceptance"],
        verifiedAt: new Date().toISOString(),
      })),
    });

    const router = new ModelRouter(
      capabilities,
      new Map([[model.identity.modelId, {
        estimatedCost: 0,
        latencyMs: 1000,
        reliability: 85,
      }]]),
    );

    const route = router.route({
      requiredCapabilities: ["coding", "reasoning"],
      minimumCapabilityStrength: 75,
      preferInternal: true,
      maximumEstimatedCost: 0,
    });

    assert(route.selected, "1.5B coding model must be routable.");
    assert(route.providerId === "internal-intelligence", "Coding must stay local.");
    assert(route.modelId === "qwen2.5-coder:1.5b", "The 1.5B model must be selected.");
    console.log("KINGS CODING MACHINE → LOCAL 1.5B ROUTING: SUCCESS");

    const request: ModelExecutionRequest = {
      id: "1.5b-acceptance-request",
      taskId: "1.5b-acceptance-task",
      missionId: "1.5b-acceptance-mission",
      messages: [
        {
          role: "system",
          content: [
            "You are a local coding worker.",
            "Return exactly one FILE block.",
            "Use this format: FILE: src/generated.ts [create]",
            "Then output only valid TypeScript source.",
            "The source must export const generatedValue = 42;",
            "Do not include any prose outside the FILE block.",
          ].join("\n"),
        },
        {
          role: "user",
          content: "Generate src/generated.ts now.",
        },
      ],
      requiredCapabilities: ["coding", "reasoning"],
      inputModalities: ["text"],
      outputModality: "text",
      maxOutputTokens: 256,
      temperature: 0,
      allowToolProposals: false,
    };

    const requests = new Map([[request.taskId, {
      request,
      target: {
        providerId: route.providerId!,
        modelId: route.modelId!,
      },
    }]]);

    const worker = new InternalModelExecutionPort(providers, requests);
    const workerResult = await worker.execute(request.taskId);
    assert(workerResult.status === "success", workerResult.summary || "Local model failed.");
    console.log("KINGS CODING MACHINE → INTERNAL MODEL PORT: SUCCESS");

    const rawModelResult = await providers.execute(
      route.providerId!,
      route.modelId!,
      request,
    );
    assert(rawModelResult.success && Boolean(rawModelResult.response), "Local provider must return a model response.");
    console.log("KINGS CODING MACHINE → 1.5B MODEL GENERATION: SUCCESS");

    const parser = new ModelCodingProposalParser({
      expectedTaskId: request.taskId,
      expectedMissionId: request.missionId,
      allowedPaths: ["src"],
      expectedFilePaths: [targetPath],
      allowMultipleFiles: false,
    });

    const governed = new GovernedLocalCodingProposal();
    const proposal = governed.propose(
      {
        response: rawModelResult,
        request,
        allowedPaths: ["src"],
      },
      parser,
    );

    assert(proposal.changes.length === 1, "Exactly one governed change expected.");
    console.log("KINGS CODING MACHINE → MODEL OUTPUT → GOVERNED PROPOSAL: SUCCESS");

    const workspaceAuthority = new EngineeringWorkspaceAuthority();
    const workspace = workspaceAuthority.create({
      id: "workspace-1.5b-acceptance",
      projectId: request.missionId,
      rootPath: workspaceRoot,
      allowedPaths: ["src"],
      allowedLanguages: ["typescript"],
      allowedOperations: ["create"],
    });

    const editor = new EngineeringRepairEditor(
      new ControlledFileEditor({
        allowedReadPaths: [workspaceRoot],
        allowedWritePaths: [allowedRoot],
        maxFileBytes: 16_384,
      }),
    );

    const repair = {
      id: "repair-1.5b-acceptance",
      strategy: "edit" as const,
      description: "Apply the governed model proposal.",
      reason: "1.5B local model acceptance proof.",
      required: true,
    };

    const authorized = new EngineeringWorkspaceProposalAuthority(workspaceAuthority).authorize({
      execution: {
        id: "execution-1.5b-acceptance",
        projectId: request.missionId,
        status: "ready",
        steps: [{
          id: request.taskId,
          language: "typescript",
          operation: "create",
          capabilityId: "engineering-typescript",
          sequence: 1,
        }],
        currentStepId: request.taskId,
        completedStepIds: [],
        blockedReasons: [],
      },
      step: {
        id: request.taskId,
        language: "typescript",
        operation: "create",
        capabilityId: "engineering-typescript",
        sequence: 1,
      },
      workspace,
      proposal,
    });

    const writeBridge = new (await import("./local-coding-write-bridge")).LocalCodingWriteBridge(editor);
    const writes = await writeBridge.execute({
      step: repair,
      projectId: request.missionId,
      workspaceRoot,
      proposal: authorized,
    });

    assert(writes.writes.length === 1, "Exactly one filesystem write expected.");
    const written = await readFile(targetAbsolute, "utf8");
    assert(written.includes("generatedValue"), "Generated source must be written.");
    assert(written.includes("42"), "Generated source must preserve the requested value.");
    console.log("KINGS CODING MACHINE → GOVERNED FILESYSTEM WRITE: SUCCESS");

    const workUnit: WorkUnitContract = {
      id: "work-unit-1.5b-acceptance",
      role: "coding-engineer",
      objective: "Verify generated TypeScript code.",
      capabilityIds: ["engineering-typescript"],
      allowedToolIds: ["tool-execution-sandbox"],
      allowedPaths: [workspaceRoot],
      budget: {
        maxTimeMs: 30_000,
        maxTokens: 1_000,
        maxIterations: 1,
      },
      dependencyIds: [],
      acceptanceCriteria: ["TypeScript compiles successfully."],
      requiredEvidenceTypes: ["command"],
      approved: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const tsc = resolveTypeScriptCompiler();

    const buildTest = new BuildTestExecutor({
      sandboxPolicy: {
        allowedCommands: [tsc],
        allowedWorkingDirectories: [workspaceRoot],
        allowedReadPaths: [workspaceRoot],
        allowedWritePaths: [workspaceRoot],
        allowedEnvironmentKeys: [],
        allowedSideEffects: ["read", "execute", "write"],
        timeoutMs: 30_000,
        maxOutputBytes: 32_768,
        maxConcurrentProcesses: 1,
        allowShell: false,
        allowNetwork: false,
      },
    });

    const buildResult = await buildTest.execute({
      taskId: request.taskId,
      workUnit,
      steps: [
        {
          id: "verify-generated-typescript",
          operation: "validate",
          command: tsc,
          args: [
            "--target", "ES2022",
            "--module", "CommonJS",
            "--moduleResolution", "Node",
            "--strict",
            "--noEmit",
            targetPath,
          ],
          workingDirectory: workspaceRoot,
        },
      ],
    });

    assert(buildResult.passed, buildResult.steps[0]?.execution.stderr || "Generated TypeScript verification failed.");
    console.log("KINGS CODING MACHINE → REAL BUILD/VERIFICATION: SUCCESS");
    console.log("KINGS CODING MACHINE → 1.5B ARTIFACT VERIFICATION: SUCCESS");
    console.log("TREE-KCM-REAL-LOCAL-1.5B-ACCEPTANCE: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("TREE-KCM-REAL-LOCAL-1.5B-ACCEPTANCE: FAILURE");
  console.error(error);
  process.exitCode = 1;
});