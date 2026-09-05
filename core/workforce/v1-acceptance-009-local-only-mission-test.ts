import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import {
  spawnSync,
} from "node:child_process";
import {
  join,
} from "node:path";

import type {
  AgentDefinition,
  Mission,
  Task,
} from "./types";
import type {
  IntelligenceCapability,
  ModelExecutionRequest,
} from "./model-interface";
import {
  WorkforceRegistry,
} from "./registry";
import {
  MissionExecutionCoordinator,
} from "./mission-execution-coordinator";
import {
  ProviderAdapterRegistry,
} from "./provider-adapters";
import {
  ModelCapabilityRegistry,
} from "./model-capability-registry";
import {
  ModelRouter,
} from "./model-routing";
import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "./ollama-execution-client";
import {
  OllamaIntelligenceModel,
} from "./ollama-intelligence-model";
import {
  GovernedInternalIntelligenceAdapter,
} from "./internal-intelligence-adapter";
import {
  InternalModelExecutionPort,
} from "./internal-model-execution-port";
import type {
  AutonomousEngineeringExecution,
  EngineeringExecutionStep,
} from "./autonomous-engineering-execution";
import {
  EngineeringWorkspaceAuthority,
} from "./engineering-workspace";
import {
  EngineeringWorkspaceProposalAuthority,
} from "./engineering-workspace-proposal";
import type {
  LocalCodingChangeProposal,
} from "./local-coding-change-proposal";
import {
  ControlledFileEditor,
} from "./file-editor";
import {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";
import type {
  EngineeringRepairStep,
} from "./engineering-repair-planner";
import {
  LocalCodingWriteBridge,
} from "./local-coding-write-bridge";

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function extractTypeScript(
  value: string,
): string {
  const fenced =
    value.match(
      /```(?:typescript|ts)?\s*([\s\S]*?)```/i,
    );

  return (
    fenced?.[1] ??
    value
  )
    .replace(/\r\n/g, "\n")
    .trim();
}

async function main(): Promise<void> {
  const missionId =
    "mission-v1-acceptance-009-local-only";
  const generationTaskId =
    "task-v1-acceptance-009-generate";
  const verificationTaskId =
    "task-v1-acceptance-009-verify";
  const modelId =
    process.env.KINGS_OLLAMA_MODEL?.trim() ||
    "qwen2.5-coder:0.5b";
  const ollamaBaseUrl =
    (
      process.env.KINGS_OLLAMA_BASE_URL?.trim() ||
      "http://127.0.0.1:11434"
    ).replace(/\/$/, "");

  const root =
    await mkdtemp(
      join(
        process.env.TMPDIR ||
          process.env.TEMP ||
          "/tmp",
        "kings-local-only-",
      ),
    );
  const workspaceRoot =
    join(root, "workspace");
  const allowedRoot =
    join(
      workspaceRoot,
      "core",
      "workforce",
    );
  const generatedRelativePath =
    "core/workforce/generated-local-only.ts";
  const generatedPath =
    join(
      workspaceRoot,
      generatedRelativePath,
    );

  try {
    const now =
      new Date().toISOString();
    const registry =
      new WorkforceRegistry();

    const mission: Mission = {
      id: missionId,
      name:
        "K.I.N.G.S. No-External-AI Acceptance Mission",
      description:
        "Complete governed coding work using only local internal intelligence.",
      status:
        "active",
      objectives: [
        "Route generation through internal intelligence only.",
        "Create one authorized TypeScript artifact.",
        "Compile and verify the artifact before mission completion.",
      ],
      sourceReferences: [
        "KINGS-V1-MASTER-CURRENT-REFERENCE.md",
      ],
      createdAt: now,
      updatedAt: now,
    };

    const agent: AgentDefinition = {
      id:
        "agent-v1-acceptance-009-local",
      name:
        "K.I.N.G.S. Local-Only Engineering Worker",
      role:
        "engineering-worker",
      description:
        "Runs the no-external-AI acceptance mission using governed local intelligence.",
      capabilities: [
        "coding",
        "verification",
      ],
      toolIds: [],
      status:
        "available",
    };

    const generationTask: Task = {
      id:
        generationTaskId,
      missionId,
      name:
        "Generate local-only TypeScript artifact",
      description:
        "Use internal-local intelligence to generate the bounded acceptance artifact.",
      requiredCapabilities: [
        "coding",
      ],
      requiredToolIds: [],
      status:
        "ready",
      dependencyIds: [],
      inputReferences: [
        "KINGS-V1-MASTER-CURRENT-REFERENCE.md",
      ],
      expectedOutputs: [
        generatedRelativePath,
      ],
      createdAt: now,
      updatedAt: now,
    };

    const verificationTask: Task = {
      id:
        verificationTaskId,
      missionId,
      name:
        "Verify local-only TypeScript artifact",
      description:
        "Compile and inspect the generated artifact before accepting mission completion.",
      requiredCapabilities: [
        "verification",
      ],
      requiredToolIds: [],
      status:
        "ready",
      dependencyIds: [
        generationTaskId,
      ],
      inputReferences: [
        generatedRelativePath,
      ],
      expectedOutputs: [
        "typescript-compile-proof",
      ],
      createdAt: now,
      updatedAt: now,
    };

    registry.registerMission(mission);
    registry.registerAgent(agent);
    registry.registerTask(generationTask);
    registry.registerTask(verificationTask);

    const coordinator =
      new MissionExecutionCoordinator({
        registry,
      });

    const firstDispatch =
      coordinator.dispatchNext(
        missionId,
      );

    assert(
      firstDispatch?.taskId ===
        generationTaskId,
      "Mission coordinator must dispatch generation before dependent verification.",
    );

    console.log(
      "V1-ACCEPTANCE-009 mission dispatch ordering: SUCCESS",
    );

    const transport: OllamaHttpTransport = {
      async post(path, body) {
        const response =
          await fetch(
            `${ollamaBaseUrl}${path}`,
            {
              method:
                "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body:
                JSON.stringify(body),
            },
          );

        if (!response.ok) {
          const text =
            await response.text();
          throw new Error(
            `Ollama HTTP ${response.status}: ${text}`,
          );
        }

        return response.json();
      },
    };

    const ollamaClient =
      new HttpOllamaExecutionClient(
        transport,
      );
    const capabilities: IntelligenceCapability[] = [
      "reasoning",
      "planning",
      "coding",
      "debugging",
      "verification",
      "recovery",
    ];
    const model =
      new OllamaIntelligenceModel(
        ollamaClient,
        modelId,
        capabilities,
      );
    const internalAdapter =
      new GovernedInternalIntelligenceAdapter({
        async execute(
          identity,
          request,
        ) {
          return ollamaClient.execute(
            identity,
            request,
          );
        },
      });

    internalAdapter.registerModel(model);

    const providers =
      new ProviderAdapterRegistry();
    providers.register(
      internalAdapter,
    );

    const capabilityRegistry =
      new ModelCapabilityRegistry();
    capabilityRegistry.register({
      model:
        model.identity,
      capabilities:
        capabilities.map(
          (capability) => ({
            capability,
            strength:
              capability === "coding"
                ? 78
                : 72,
            status:
              "verified" as const,
            evidenceReferences: [
              "v1-acceptance-009-live-ollama",
            ],
            verifiedAt:
              new Date().toISOString(),
          }),
        ),
    });

    const router =
      new ModelRouter(
        capabilityRegistry,
        new Map([
          [
            model.identity.modelId,
            {
              estimatedCost: 0,
              latencyMs: 1000,
              reliability: 70,
            },
          ],
        ]),
      );
    const route =
      router.route({
        requiredCapabilities: [
          "coding",
          "reasoning",
        ],
        minimumCapabilityStrength: 70,
        internalOnly: true,
        maximumEstimatedCost: 0,
      });

    assert(
      route.selected &&
      route.providerId ===
        "internal-intelligence" &&
      route.modelId ===
        modelId,
      "Live mission must select the configured internal-local model.",
    );
    assert(
      route.candidates.length > 0 &&
      route.candidates.every(
        (candidate) =>
          candidate.internal,
      ),
      "Live mission route must contain no external AI candidates.",
    );

    console.log(
      "V1-ACCEPTANCE-009 internal-only live route: SUCCESS",
    );

    const request: ModelExecutionRequest = {
      id:
        "request-v1-acceptance-009-generate",
      taskId:
        generationTaskId,
      missionId,
      messages: [
        {
          role:
            "system",
          content: [
            "You are the K.I.N.G.S. local-only coding worker.",
            "Return only one TypeScript source file and no explanation.",
            "The source must export a constant named kingsLocalOnlyAcceptance with numeric value 42.",
            "Do not use markdown fences unless unavoidable.",
          ].join("\n"),
        },
        {
          role:
            "user",
          content:
            "Generate the smallest valid TypeScript file that satisfies the requirement.",
        },
      ],
      requiredCapabilities: [
        "coding",
        "reasoning",
      ],
      inputModalities: [
        "text",
      ],
      outputModality:
        "text",
      maxOutputTokens: 128,
      temperature: 0,
      allowToolProposals: false,
    };

    const executionPort =
      new InternalModelExecutionPort(
        providers,
        new Map([
          [
            generationTaskId,
            {
              request,
              target: {
                providerId:
                  route.providerId,
                modelId:
                  route.modelId,
              },
            },
          ],
        ]),
      );
    const workerResult =
      await executionPort.execute(
        generationTaskId,
      );

    assert(
      workerResult.status ===
        "success",
      workerResult.summary ||
        "Local-only model execution failed.",
    );

    const generatedContent =
      extractTypeScript(
        workerResult.summary,
      );
    assert(
      /kingsLocalOnlyAcceptance/.test(
        generatedContent,
      ) &&
      /42/.test(
        generatedContent,
      ),
      "Local model output must contain the required acceptance symbol and value.",
    );

    const engineeringExecution: AutonomousEngineeringExecution = {
      id:
        "engineering-v1-acceptance-009",
      projectId:
        missionId,
      status:
        "ready",
      steps: [],
      currentStepId:
        generationTaskId,
      completedStepIds: [],
      blockedReasons: [],
    };
    const engineeringStep: EngineeringExecutionStep = {
      id:
        generationTaskId,
      language:
        "typescript",
      operation:
        "create",
      capabilityId:
        "engineering-typescript",
      sequence: 1,
    };
    engineeringExecution.steps.push(
      engineeringStep,
    );

    const workspaceAuthority =
      new EngineeringWorkspaceAuthority();
    const workspace =
      workspaceAuthority.create({
        id:
          "workspace-v1-acceptance-009",
        projectId:
          missionId,
        rootPath:
          workspaceRoot,
        allowedPaths: [
          "core/workforce",
        ],
        allowedLanguages: [
          "typescript",
        ],
        allowedOperations: [
          "create",
        ],
      });
    const proposal: LocalCodingChangeProposal = {
      id:
        "proposal-v1-acceptance-009",
      taskId:
        generationTaskId,
      missionId,
      summary:
        "Internal-only local model generated the bounded acceptance artifact.",
      changes: [
        {
          path:
            generatedRelativePath,
          operation:
            "create",
          content:
            `${generatedContent}\n`,
        },
      ],
    };
    const proposalAuthority =
      new EngineeringWorkspaceProposalAuthority(
        workspaceAuthority,
      );
    const authorized =
      proposalAuthority.authorize({
        execution:
          engineeringExecution,
        step:
          engineeringStep,
        workspace,
        proposal,
      });

    const fileEditor =
      new ControlledFileEditor({
        allowedReadPaths: [
          workspaceRoot,
        ],
        allowedWritePaths: [
          allowedRoot,
        ],
        maxFileBytes: 16_384,
      });
    const writeBridge =
      new LocalCodingWriteBridge(
        new EngineeringRepairEditor(
          fileEditor,
        ),
      );
    const repairStep: EngineeringRepairStep = {
      id:
        generationTaskId,
      strategy:
        "edit",
      description:
        "Apply the authorized internal-only coding proposal.",
      reason:
        "V1 acceptance requires a real governed filesystem write.",
      required: true,
    };
    const writeResult =
      await writeBridge.execute({
        step:
          repairStep,
        projectId:
          missionId,
        workspaceRoot,
        proposal:
          authorized,
      });

    assert(
      writeResult.writes.length === 1,
      "Live mission must perform exactly one governed filesystem write.",
    );
    coordinator.completeTask(
      generationTaskId,
    );

    const secondDispatch =
      coordinator.dispatchNext(
        missionId,
      );
    assert(
      secondDispatch?.taskId ===
        verificationTaskId,
      "Verification task must become runnable only after generation completes.",
    );

    const written =
      await readFile(
        generatedPath,
        "utf8",
      );
    assert(
      written.includes(
        "kingsLocalOnlyAcceptance",
      ) &&
      written.includes("42"),
      "Written artifact must preserve the required acceptance symbol and value.",
    );

    const tscPath =
      join(
        process.cwd(),
        "node_modules",
        "typescript",
        "bin",
        "tsc",
      );
    const compile =
      spawnSync(
        process.execPath,
        [
          tscPath,
          "--noEmit",
          "--target",
          "ES2022",
          "--module",
          "NodeNext",
          "--moduleResolution",
          "NodeNext",
          generatedPath,
        ],
        {
          cwd:
            workspaceRoot,
          encoding:
            "utf8",
        },
      );

    assert(
      compile.status === 0,
      `Generated local-only artifact did not compile: ${compile.stdout || compile.stderr}`,
    );

    coordinator.completeTask(
      verificationTaskId,
    );
    mission.status =
      "completed";
    mission.updatedAt =
      new Date().toISOString();

    const finalSnapshot =
      coordinator.snapshot(
        missionId,
      );
    assert(
      finalSnapshot.completedTaskIds.length ===
        2 &&
      finalSnapshot.failedTaskIds.length ===
        0 &&
      finalSnapshot.runningTaskIds.length ===
        0 &&
      mission.status ===
        "completed",
      "Local-only mission must finish with every task completed and no failed/running work.",
    );

    console.log(
      "V1-ACCEPTANCE-009 governed write and TypeScript compile: SUCCESS",
    );
    console.log(
      "V1-ACCEPTANCE-009 NO-EXTERNAL-AI MISSION: SUCCESS",
    );
  } finally {
    await rm(
      root,
      {
        recursive: true,
        force: true,
      },
    );
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
