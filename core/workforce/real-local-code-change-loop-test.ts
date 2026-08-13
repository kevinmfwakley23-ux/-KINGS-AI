import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import type {
  IntelligenceCapability,
  ModelExecutionRequest,
} from "./model-interface";

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
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function normalize(
  value:
    string,
):
  string {
  return value
    .replace(
      /\r\n/g,
      "\n",
    )
    .trim();
}

async function main(): Promise<void> {
  const root =
    await mkdtemp(
      "/tmp/kings-real-local-loop-",
    );

  const workspaceRoot =
    join(
      root,
      "workspace",
    );

  const allowedRoot =
    join(
      workspaceRoot,
      "core",
      "workforce",
    );

  const generatedPath =
    join(
      allowedRoot,
      "generated-local.ts",
    );

  try {
    const transport:
      OllamaHttpTransport = {
      async post(
        path,
        body,
      ) {
        const response =
          await fetch(
            `http://127.0.0.1:11434${path}`,
            {
              method:
                "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  body,
                ),
            },
          );

        if (
          !response.ok
        ) {
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

    const model =
      new OllamaIntelligenceModel(
        ollamaClient,
        "qwen2.5-coder:0.5b",
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

    const internalAdapter =
      new GovernedInternalIntelligenceAdapter(
        {
          async execute(
            identity,
            request,
          ) {
            return ollamaClient.execute(
              identity,
              request,
            );
          },
        },
      );

    internalAdapter.registerModel(
      model,
    );

    const providers =
      new ProviderAdapterRegistry();

    providers.register(
      internalAdapter,
    );

    const capabilities:
      IntelligenceCapability[] =
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
      ];

    const capabilityProfiles =
      capabilities.map(
        (
          capability,
        ) => ({
          capability,
          strength:
            capability ===
              "coding"
              ? 78
              : 72,
          status:
            "verified" as const,
          evidenceReferences: [
            "real-local-model",
            "real-ollama-adapter",
            "real-local-coding-proof",
          ],
          verifiedAt:
            new Date().toISOString(),
        }),
      );

    const capabilityRegistry =
      new ModelCapabilityRegistry();

    capabilityRegistry.register({
      model:
        model.identity,
      capabilities:
        capabilityProfiles,
    });

    const router =
      new ModelRouter(
        capabilityRegistry,
        new Map([
          [
            model.identity.modelId,
            {
              estimatedCost:
                0,
              latencyMs:
                1000,
              reliability:
                70,
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
        minimumCapabilityStrength:
          70,
        preferInternal:
          true,
        maximumEstimatedCost:
          0,
      });

    assert(
      route.selected &&
      route.providerId ===
        "internal-intelligence" &&
      route.modelId ===
        "qwen2.5-coder:0.5b",
      "The live local model must be selected for the coding task.",
    );

    console.log(
      "06/08.REAL live model routing: SUCCESS",
    );

    const request:
      ModelExecutionRequest = {
      id:
        "real-local-edit-request",
      taskId:
        "step-real-local-edit",
      missionId:
        "project-real-local-edit",
      messages: [
        {
          role:
            "system",
          content:
            [
              "You are the K.I.N.G.S. local coding worker.",
              "Produce only a single TypeScript source file.",
              "Do not mention markdown fences.",
              "Do not claim repository access.",
              "The file must export a constant named kingsGeneratedValue with value 42.",
            ].join(
              "\n",
            ),
        },
        {
          role:
            "user",
          content:
            "Generate the smallest valid TypeScript file satisfying the requirement.",
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
      maxOutputTokens:
        128,
      temperature:
        0,
      allowToolProposals:
        false,
    };

    const requests =
      new Map([
        [
          request.taskId,
          {
            request,
            target: {
              providerId:
                route.providerId!,
              modelId:
                route.modelId!,
            },
          },
        ],
      ]);

    const executionPort =
      new InternalModelExecutionPort(
        providers,
        requests,
      );

    const workerResult =
      await executionPort.execute(
        request.taskId,
      );

    assert(
      workerResult.status ===
        "success",
      workerResult.summary ||
        "The real local model did not produce a coding result.",
    );

    const generatedContent =
      normalize(
        workerResult.summary,
      );

    assert(
      /kingsGeneratedValue/.test(
        generatedContent,
      ),
      "The local model output must contain the required exported constant.",
    );

    assert(
      /42/.test(
        generatedContent,
      ),
      "The local model output must contain the required value.",
    );

    console.log(
      "06/08.REAL local coding generation: SUCCESS",
    );

    const execution:
      AutonomousEngineeringExecution = {
      id:
        "engineering-execution-real-local",
      projectId:
        "project-real-local-edit",
      status:
        "ready",
      steps: [],
      currentStepId:
        "step-real-local-edit",
      completedStepIds: [],
      blockedReasons: [],
    };

    const step:
      EngineeringExecutionStep = {
      id:
        "step-real-local-edit",
      language:
        "typescript",
      operation:
        "create",
      capabilityId:
        "engineering-typescript",
      sequence:
        1,
    };

    execution.steps.push(
      step,
    );

    const workspaceAuthority =
      new EngineeringWorkspaceAuthority();

    const workspace =
      workspaceAuthority.create({
        id:
          "workspace-real-local",
        projectId:
          "project-real-local-edit",
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

    const proposal:
      LocalCodingChangeProposal = {
      id:
        "proposal-real-local",
      taskId:
        "step-real-local-edit",
      missionId:
        "project-real-local-edit",
      summary:
        "Real local model generated a bounded TypeScript file.",
      changes: [
        {
          path:
            "core/workforce/generated-local.ts",
          operation:
            "create",
          content:
            generatedContent.endsWith(
              "\n",
            )
              ? generatedContent
              : `${generatedContent}\n`,
        },
      ],
    };

    const proposalAuthority =
      new EngineeringWorkspaceProposalAuthority(
        workspaceAuthority,
      );

    const authorized =
      proposalAuthority.authorize({
        execution,
        step,
        workspace,
        proposal,
      });

    assert(
      authorized.changes.length ===
        1,
      "Exactly one authorized local-code change is expected.",
    );

    console.log(
      "06/08.REAL local coding authorization: SUCCESS",
    );

    const fileEditor =
      new ControlledFileEditor({
        allowedReadPaths: [
          workspaceRoot,
        ],
        allowedWritePaths: [
          allowedRoot,
        ],
        maxFileBytes:
          16_384,
      });

    const repairEditor =
      new EngineeringRepairEditor(
        fileEditor,
      );

    const writeBridge =
      new LocalCodingWriteBridge(
        repairEditor,
      );

    const repairStep:
      EngineeringRepairStep = {
      id:
        "step-real-local-edit",
      strategy:
        "edit",
      description:
        "Apply the authorized local coding proposal.",
      reason:
        "Real local intelligence generated a verified bounded change.",
      required:
        true,
    };

    const writeResult =
      await writeBridge.execute({
        step:
          repairStep,
        projectId:
          "project-real-local-edit",
        workspaceRoot,
        proposal:
          authorized,
      });

    assert(
      writeResult.writes.length ===
        1,
      "Exactly one governed filesystem write is expected.",
    );

    console.log(
      "06/08.REAL governed filesystem write: SUCCESS",
    );

    const written =
      normalize(
        await readFile(
          generatedPath,
          "utf8",
        ),
      );

    assert(
      written.includes(
        "kingsGeneratedValue",
      ),
      "Written file must contain the generated symbol.",
    );

    assert(
      written.includes(
        "42",
      ),
      "Written file must contain the generated value.",
    );

    console.log(
      "06/08.REAL generated artifact verification: SUCCESS",
    );

    console.log(
      "TREE-06/08 REAL LOCAL MODEL → AUTHORIZED CODE CHANGE: SUCCESS",
    );
  } finally {
    await rm(
      root,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
