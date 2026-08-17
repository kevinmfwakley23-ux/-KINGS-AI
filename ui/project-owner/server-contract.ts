import {
  ProjectOwnerMachineApi,
  type ProjectOwnerMachineApiRequest,
  type ProjectOwnerMachineApiResponse,
  type ProjectOwnerMissionFactory,
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
  ProjectOwnerMachineApiRequest,
} from "../../core/workforce/project-owner-machine-api";

export interface ProjectOwnerMachineApiHandler {
  handle(
    request:
      ProjectOwnerMachineApiRequest,
  ): Promise<ProjectOwnerMachineApiResponse>;
}

export interface ProjectOwnerRuntimeOptions {
  ollamaBaseUrl?: string;
  modelId?: string;
  workspaceRoot?: string;
}

type BuildTestOptions = ConstructorParameters<
  typeof import("../../core/workforce/coding-work-unit-execution").CodingWorkUnitExecutionAuthority
>[1];

export class ProjectOwnerMachineServerController
  implements ProjectOwnerMachineApiHandler {
  private readonly api:
    ProjectOwnerMachineApi;

  private readonly editor:
    EngineeringRepairEditor;

  private readonly buildTestOptions:
    BuildTestOptions;

  constructor(
    machine:
      KingsCodingMachine,
    missionFactory:
      ProjectOwnerMissionFactory,
    runtime:
      ProjectOwnerRuntimeOptions = {},
  ) {
    const modelId =
      runtime.modelId ??
      "qwen2.5-coder:1.5b";

    const baseUrl =
      runtime.ollamaBaseUrl ??
      "http://127.0.0.1:11434";

    const workspaceRoot =
      runtime.workspaceRoot ??
      process.cwd();

    const transport: OllamaHttpTransport = {
      async post(path, body) {
        const response = await fetch(
          `${baseUrl}${path}`,
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body:
              JSON.stringify(body),
          },
        );

        if (!response.ok) {
          throw new Error(
            `Ollama HTTP ${response.status}: ${await response.text()}`,
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
        modelId,
        [
          "reasoning",
          "planning",
          "coding",
          "debugging",
          "source-inspection",
          "verification",
          "recovery",
        ],
      );

    const adapter =
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

    adapter.registerModel(
      model,
    );

    const providers =
      new ProviderAdapterRegistry();
    providers.register(
      adapter,
    );

    const capabilities =
      new ModelCapabilityRegistry();

    capabilities.register({
      model:
        model.identity,
      capabilities: [
        "reasoning",
        "planning",
        "coding",
        "debugging",
        "source-inspection",
        "verification",
        "recovery",
      ].map(
        (capability) => ({
          capability,
          strength:
            capability ===
            "coding"
              ? 90
              : 82,
          status:
            "verified" as const,
          evidenceReferences: [
            "real-local-1.5b-acceptance",
          ],
          verifiedAt:
            new Date().toISOString(),
        }),
      ),
    });

    const router =
      new ModelRouter(
        capabilities,
        new Map([
          [
            model.identity.modelId,
            {
              estimatedCost: 0,
              latencyMs: 1000,
              reliability: 85,
            },
          ],
        ]),
      );

    const modelDrivenCoding =
      new ModelDrivenCodingExecutionAuthority(
        machine,
        router,
        providers,
      );

    this.editor =
      new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [
            workspaceRoot,
          ],
          allowedWritePaths: [
            workspaceRoot,
          ],
          maxFileBytes:
            1_048_576,
        }),
      );

    this.buildTestOptions = {
      sandboxPolicy: {
        allowedCommands: [
          process.execPath,
          "/tmp/kings-typescript/node_modules/.bin/tsc",
        ],
        allowedWorkingDirectories: [
          workspaceRoot,
        ],
        allowedReadPaths: [
          workspaceRoot,
        ],
        allowedWritePaths: [
          workspaceRoot,
        ],
        allowedEnvironmentKeys: [],
        allowedSideEffects: [
          "read",
          "write",
          "execute",
        ],
        timeoutMs:
          60_000,
        maxOutputBytes:
          131_072,
        maxConcurrentProcesses:
          1,
        allowShell:
          false,
        allowNetwork:
          false,
      },
    };

    this.api =
      new ProjectOwnerMachineApi(
        machine,
        missionFactory,
        modelDrivenCoding,
        new ProjectOwnerUiController(),
      );
  }

  handle(
    request:
      ProjectOwnerMachineApiRequest,
  ): Promise<ProjectOwnerMachineApiResponse> {
    if (
      request.action !==
      "execute-next"
    ) {
      return this.api.handle(
        request,
      );
    }

    return this.api.handle({
      ...request,
      editor:
        request.editor ??
        this.editor,
      buildTestOptions:
        request.buildTestOptions ??
        this.buildTestOptions,
    });
  }
}

export function createProjectOwnerMissionRequest(
  input:
    ProjectOwnerDesignInput,
): ProjectOwnerMachineApiRequest {
  return {
    action:
      "create-mission",
    input,
  };
}

export function createProjectOwnerExecuteRequest(
  missionId: string,
  executionRequest:
    NonNullable<
      ProjectOwnerMachineApiRequest["executionRequest"]
    >,
): ProjectOwnerMachineApiRequest {
  return {
    action:
      "execute-next",
    missionId,
    executionRequest,
  };
}
