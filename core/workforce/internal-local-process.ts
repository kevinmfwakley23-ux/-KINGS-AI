import { spawn } from "node:child_process";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";

export interface InternalLocalProcessCommand {
  executable: string;
  args: string[];

  buildRequest(
    request: ModelExecutionRequest,
  ): string;

  parseResponse(
    stdout: string,
    request: ModelExecutionRequest,
    model: ModelIdentity,
  ): ModelExecutionResult;

  timeoutMs: number;

  environment?:
    Record<string, string>;
}

export interface InternalLocalProcessExecutor {
  execute(
    command: InternalLocalProcessCommand,
    request: ModelExecutionRequest,
    model: ModelIdentity,
  ): Promise<ModelExecutionResult>;
}

function failure(
  request: ModelExecutionRequest,
  model: ModelIdentity,
  startedAt: Date,
  code: string,
  message: string,
  retryable: boolean,
): ModelExecutionResult {
  const completedAt =
    new Date();

  return {
    success: false,
    failure: {
      requestId:
        request.id,
      providerId:
        model.providerId,
      modelId:
        model.modelId,
      retryable,
      code,
      message,
      metadata: {
        requestId:
          request.id,
        startedAt:
          startedAt.toISOString(),
        completedAt:
          completedAt.toISOString(),
        latencyMs:
          completedAt.getTime() -
          startedAt.getTime(),
      },
    },
  };
}

export class SpawnedInternalLocalProcessExecutor
  implements InternalLocalProcessExecutor {

  async execute(
    command: InternalLocalProcessCommand,
    request: ModelExecutionRequest,
    model: ModelIdentity,
  ): Promise<ModelExecutionResult> {
    const startedAt =
      new Date();

    const input =
      command.buildRequest(
        request,
      );

    return new Promise(
      (resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;

        const finish = (
          result: ModelExecutionResult,
        ): void => {
          if (settled) {
            return;
          }

          settled = true;
          resolve(result);
        };

        const child =
          spawn(
            command.executable,
            command.args,
            {
              shell: false,
              stdio: [
                "pipe",
                "pipe",
                "pipe",
              ],
              env: {
                ...process.env,
                ...(command.environment ?? {}),
              },
            },
          );

        const timer =
          setTimeout(
            () => {
              child.kill(
                "SIGTERM",
              );

              finish(
                failure(
                  request,
                  model,
                  startedAt,
                  "LOCAL_PROCESS_TIMEOUT",
                  `Local intelligence process exceeded ${command.timeoutMs}ms.`,
                  true,
                ),
              );
            },
            command.timeoutMs,
          );

        child.stdout.on(
          "data",
          (
            chunk: Buffer,
          ) => {
            stdout +=
              chunk.toString();
          },
        );

        child.stderr.on(
          "data",
          (
            chunk: Buffer,
          ) => {
            stderr +=
              chunk.toString();
          },
        );

        child.on(
          "error",
          (
            error: Error,
          ) => {
            clearTimeout(
              timer,
            );

            finish(
              failure(
                request,
                model,
                startedAt,
                "LOCAL_PROCESS_ERROR",
                error.message,
                false,
              ),
            );
          },
        );

        child.on(
          "close",
          (
            exitCode,
          ) => {
            clearTimeout(
              timer,
            );

            if (
              exitCode !==
              0
            ) {
              finish(
                failure(
                  request,
                  model,
                  startedAt,
                  "LOCAL_PROCESS_EXIT_FAILURE",
                  stderr.trim() ||
                    `Local intelligence process exited with code ${exitCode}.`,
                  true,
                ),
              );

              return;
            }

            try {
              finish(
                command.parseResponse(
                  stdout,
                  request,
                  model,
                ),
              );
            } catch (
              error
            ) {
              finish(
                failure(
                  request,
                  model,
                  startedAt,
                  "LOCAL_PROCESS_RESPONSE_INVALID",
                  error instanceof Error
                    ? error.message
                    : String(error),
                  false,
                ),
              );
            }
          },
        );

        child.stdin.write(
          input,
        );

        child.stdin.end();
      },
    );
  }
}

export interface LocalProcessModelConfig {
  model: ModelIdentity;
  command: InternalLocalProcessCommand;
}

export class LocalProcessIntelligenceModel {
  readonly identity:
    ModelIdentity;

  private readonly command:
    InternalLocalProcessCommand;

  private readonly executor:
    InternalLocalProcessExecutor;

  constructor(
    executor:
      InternalLocalProcessExecutor,
    config:
      LocalProcessModelConfig,
  ) {
    this.executor =
      executor;

    this.identity =
      config.model;

    this.command =
      config.command;
  }

  canHandle(
    request: ModelExecutionRequest,
  ): boolean {
    if (
      !this.identity.available
    ) {
      return false;
    }

    if (
      request.outputModality !==
      "text"
    ) {
      return false;
    }

    const capabilities =
      new Set<string>(
        this.identity.capabilities,
      );

    return request.requiredCapabilities.every(
      (
        capability,
      ) =>
        capabilities.has(
          capability,
        ),
    );
  }

  execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    if (
      !this.canHandle(
        request,
      )
    ) {
      return Promise.resolve({
        success: false,
        failure: {
          requestId:
            request.id,
          providerId:
            this.identity.providerId,
          modelId:
            this.identity.modelId,
          retryable: false,
          code:
            "LOCAL_MODEL_CAPABILITY_MISMATCH",
          message:
            `Internal model "${this.identity.modelId}" cannot handle the requested execution.`,
          metadata: {
            requestId:
              request.id,
            startedAt:
              new Date().toISOString(),
            completedAt:
              new Date().toISOString(),
            latencyMs: 0,
          },
        },
      });
    }

    return this.executor.execute(
      this.command,
      request,
      this.identity,
    );
  }
}

export function createPlainTextLineProtocolModel(
  executor:
    InternalLocalProcessExecutor,
  model:
    ModelIdentity,
  executable:
    string,
  args:
    string[] = [],
  timeoutMs:
    number = 120_000,
):
  LocalProcessIntelligenceModel {
  return new LocalProcessIntelligenceModel(
    executor,
    {
      model,
      command: {
        executable,
        args,
        timeoutMs,
        buildRequest:
          (
            request,
          ) =>
            JSON.stringify(
              request,
            ) +
            "\n",
        parseResponse:
          (
            stdout,
            request,
            responseModel,
          ) => ({
            success: true,
            response: {
              requestId:
                request.id,
              model:
                responseModel,
              content:
                stdout.trim(),
              toolCallProposals: [],
              usage: {
                elapsedMs: 0,
                tokensUsed: 0,
                iterationsUsed: 1,
                inputTokens: 0,
                outputTokens: 0,
                estimatedCost: 0,
              },
              metadata: {
                requestId:
                  request.id,
                startedAt:
                  new Date().toISOString(),
                completedAt:
                  new Date().toISOString(),
                latencyMs: 0,
              },
            },
          }),
      },
    },
  );
}
