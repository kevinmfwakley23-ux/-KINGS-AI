import {
  spawn,
} from "node:child_process";

import {
  resolve,
  relative,
  isAbsolute,
} from "node:path";

import type {
  ID,
} from "./types";

export const EXECUTION_SANDBOX_TOOL_ID =
  "tool-execution-sandbox";

export type SandboxSideEffect =
  | "read"
  | "write"
  | "execute"
  | "network";

export interface SandboxPolicy {
  allowedCommands: string[];
  allowedWorkingDirectories: string[];
  allowedReadPaths: string[];
  allowedWritePaths: string[];
  allowedEnvironmentKeys: string[];
  allowedSideEffects: SandboxSideEffect[];
  timeoutMs: number;
  maxOutputBytes: number;
  maxConcurrentProcesses: number;
  allowShell: boolean;
  allowNetwork: boolean;
}

export interface SandboxExecutionRequest {
  command: string;
  args?: string[];
  workingDirectory: string;
  environment?: Record<string, string>;
  sideEffects?: SandboxSideEffect[];
}

export interface SandboxExecutionResult {
  command: string;
  args: string[];
  workingDirectory: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTruncated: boolean;
  startedAt: string;
  completedAt: string;
}

export interface SandboxProcess {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  once(
    event: string,
    listener: (...args: any[]) => void,
  ): SandboxProcess;
  kill(
    signal?: NodeJS.Signals,
  ): boolean;
}

export type SandboxSpawner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    shell: false;
    stdio: [
      "ignore",
      "pipe",
      "pipe",
    ];
  },
) => SandboxProcess;

export class ExecutionSandboxPolicyError
  extends Error {
  constructor(
    message: string,
  ) {
    super(
      `K.I.N.G.S. Execution Sandbox: ${message}`,
    );

    this.name =
      "ExecutionSandboxPolicyError";
  }
}

function normalizePath(
  path: string,
): string {
  return resolve(
    path,
  );
}

function isPathWithin(
  candidate: string,
  allowedRoot: string,
): boolean {
  const relativePath =
    relative(
      normalizePath(
        allowedRoot,
      ),
      normalizePath(
        candidate,
      ),
    );

  return (
    relativePath === "" ||
    (
      !relativePath.startsWith(
        "..",
      ) &&
      !isAbsolute(
        relativePath,
      )
    )
  );
}

function assertStringArray(
  value: unknown,
  name: string,
): asserts value is string[] {
  if (
    !Array.isArray(
      value,
    ) ||
    value.some(
      (
        item,
      ) =>
        typeof item !==
        "string",
    )
  ) {
    throw new ExecutionSandboxPolicyError(
      `${name} must be an array of strings`,
    );
  }
}

function uniqueStrings(
  values: string[],
): string[] {
  return [
    ...new Set(
      values,
    ),
  ];
}

export class ExecutionSandbox {
  private activeProcesses =
    0;

  private readonly spawnProcess:
    SandboxSpawner;

  constructor(
    private readonly policy:
      SandboxPolicy,
    spawner?:
      SandboxSpawner,
  ) {
    assertStringArray(
      policy.allowedCommands,
      "allowedCommands",
    );

    assertStringArray(
      policy.allowedWorkingDirectories,
      "allowedWorkingDirectories",
    );

    assertStringArray(
      policy.allowedReadPaths,
      "allowedReadPaths",
    );

    assertStringArray(
      policy.allowedWritePaths,
      "allowedWritePaths",
    );

    assertStringArray(
      policy.allowedEnvironmentKeys,
      "allowedEnvironmentKeys",
    );

    if (
      policy.timeoutMs <
        1
    ) {
      throw new ExecutionSandboxPolicyError(
        "timeoutMs must be at least 1",
      );
    }

    if (
      policy.maxOutputBytes <
        1
    ) {
      throw new ExecutionSandboxPolicyError(
        "maxOutputBytes must be at least 1",
      );
    }

    if (
      policy.maxConcurrentProcesses <
        1
    ) {
      throw new ExecutionSandboxPolicyError(
        "maxConcurrentProcesses must be at least 1",
      );
    }

    if (
      policy.allowShell
    ) {
      throw new ExecutionSandboxPolicyError(
        "shell execution is permanently disabled",
      );
    }

    if (
      policy.allowNetwork &&
      !policy.allowedSideEffects.includes(
        "network",
      )
    ) {
      throw new ExecutionSandboxPolicyError(
        "network access requires explicit network side-effect authorization",
      );
    }

    this.spawnProcess =
      spawner ??
      ((
        command,
        args,
        options,
      ) =>
        spawn(
          command,
          args,
          options,
        ));
  }

  authorize(
    request:
      SandboxExecutionRequest,
  ): void {
    const command =
      request.command
        .trim();

    if (
      command.length ===
      0
    ) {
      throw new ExecutionSandboxPolicyError(
        "command is required",
      );
    }

    if (
      request.command !==
      command
    ) {
      throw new ExecutionSandboxPolicyError(
        "command may not contain leading or trailing whitespace",
      );
    }

    if (
      request.command.includes(
        "\n",
      ) ||
      request.command.includes(
        "\r",
      )
    ) {
      throw new ExecutionSandboxPolicyError(
        "command may not contain newline characters",
      );
    }

    if (
      !this.policy.allowedCommands.includes(
        command,
      )
    ) {
      throw new ExecutionSandboxPolicyError(
        `command "${command}" is not authorized`,
      );
    }

    const workingDirectory =
      normalizePath(
        request.workingDirectory,
      );

    if (
      !this.policy.allowedWorkingDirectories.some(
        (
          allowed,
        ) =>
          isPathWithin(
            workingDirectory,
            allowed,
          ),
      )
    ) {
      throw new ExecutionSandboxPolicyError(
        `working directory "${workingDirectory}" is not authorized`,
      );
    }

    const requestedEffects =
      uniqueStrings(
        request.sideEffects ??
          [
            "read",
          ],
      ) as SandboxSideEffect[];

    for (
      const effect of
        requestedEffects
    ) {
      if (
        !this.policy.allowedSideEffects.includes(
          effect,
        )
      ) {
        throw new ExecutionSandboxPolicyError(
          `side effect "${effect}" is not authorized`,
        );
      }

      if (
        effect ===
          "network" &&
        !this.policy.allowNetwork
      ) {
        throw new ExecutionSandboxPolicyError(
          "network access is disabled",
        );
      }
    }

    const environment =
      request.environment ??
      {};

    for (
      const key of
        Object.keys(
          environment,
        )
    ) {
      if (
        !this.policy.allowedEnvironmentKeys.includes(
          key,
        )
      ) {
        throw new ExecutionSandboxPolicyError(
          `environment key "${key}" is not authorized`,
        );
      }
    }

    if (
      request.sideEffects?.includes(
        "write",
      )
    ) {
      if (
        this.policy.allowedWritePaths.length ===
        0
      ) {
        throw new ExecutionSandboxPolicyError(
          "write side effect requested but no write paths are authorized",
        );
      }
    }

    if (
      request.sideEffects?.includes(
        "read",
      )
    ) {
      if (
        this.policy.allowedReadPaths.length ===
        0
      ) {
        throw new ExecutionSandboxPolicyError(
          "read side effect requested but no read paths are authorized",
        );
      }
    }

    if (
      this.activeProcesses >=
      this.policy.maxConcurrentProcesses
    ) {
      throw new ExecutionSandboxPolicyError(
        "maximum concurrent process limit reached",
      );
    }
  }

  async execute(
    request:
      SandboxExecutionRequest,
  ): Promise<SandboxExecutionResult> {
    this.authorize(
      request,
    );

    const command =
      request.command;

    const args =
      request.args ??
      [];

    if (
      args.some(
        (
          arg,
        ) =>
          typeof arg !==
          "string",
      )
    ) {
      throw new ExecutionSandboxPolicyError(
        "all command arguments must be strings",
      );
    }

    const startedAt =
      new Date().toISOString();

    const workingDirectory =
      normalizePath(
        request.workingDirectory,
      );

    const environment =
      this.buildEnvironment(
        request.environment,
      );

    this.activeProcesses +=
      1;

    try {
      const child =
        this.spawnProcess(
          command,
          args,
          {
            cwd:
              workingDirectory,
            env:
              environment,
            shell:
              false,
            stdio: [
              "ignore",
              "pipe",
              "pipe",
            ],
          },
        );

      return await this.collectResult(
        child,
        {
          command,
          args,
          workingDirectory,
          startedAt,
        },
      );
    } finally {
      this.activeProcesses -=
        1;
    }
  }

  private buildEnvironment(
    requested?:
      Record<string, string>,
  ): Record<string, string> {
    const result:
      Record<string, string> = {};

    for (
      const key of
        this.policy
          .allowedEnvironmentKeys
    ) {
      const requestedValue =
        requested?.[key];
      const inheritedValue =
        process.env[key];

      if (
        requestedValue !==
        undefined
      ) {
        result[key] =
          requestedValue;
      } else if (
        inheritedValue !==
        undefined
      ) {
        result[key] =
          inheritedValue;
      }
    }

    return result;
  }

  private async collectResult(
    child:
      SandboxProcess,
    metadata: {
      command: string;
      args: string[];
      workingDirectory:
        string;
      startedAt:
        string;
    },
  ): Promise<SandboxExecutionResult> {
    let stdout =
      "";

    let stderr =
      "";

    let outputBytes =
      0;

    let outputTruncated =
      false;

    const append =
      (
        target:
          "stdout" |
          "stderr",
        chunk:
          Buffer,
      ) => {
        const remaining =
          this.policy
            .maxOutputBytes -
          outputBytes;

        if (
          remaining <=
          0
        ) {
          outputTruncated =
            true;
          return;
        }

        const text =
          chunk.toString(
            "utf8",
          );

        const bytes =
          Buffer.byteLength(
            text,
            "utf8",
          );

        if (
          bytes <=
          remaining
        ) {
          if (
            target ===
            "stdout"
          ) {
            stdout +=
              text;
          } else {
            stderr +=
              text;
          }

          outputBytes +=
            bytes;

          return;
        }

        const truncated =
          Buffer.from(
            text,
            "utf8",
          )
            .subarray(
              0,
              remaining,
            )
            .toString(
              "utf8",
            );

        if (
          target ===
          "stdout"
        ) {
          stdout +=
            truncated;
        } else {
          stderr +=
            truncated;
        }

        outputBytes =
          this.policy
            .maxOutputBytes;

        outputTruncated =
          true;
      };

    child.stdout.on(
      "data",
      (
        chunk:
          Buffer,
      ) =>
        append(
          "stdout",
          chunk,
        ),
    );

    child.stderr.on(
      "data",
      (
        chunk:
          Buffer,
      ) =>
        append(
          "stderr",
          chunk,
        ),
    );

    return new Promise(
      (
        resolveResult,
      ) => {
        let timedOut =
          false;

        const timer =
          setTimeout(
            () => {
              timedOut =
                true;

              child.kill(
                "SIGTERM",
              );
            },
            this.policy
              .timeoutMs,
          );

        child.once(
          "close",
          (
            exitCode:
              number | null,
            signal:
              NodeJS.Signals | null,
          ) => {
            clearTimeout(
              timer,
            );

            resolveResult({
              command:
                metadata.command,
              args:
                metadata.args,
              workingDirectory:
                metadata
                  .workingDirectory,
              exitCode,
              signal:
                signal ??
                null,
              stdout,
              stderr,
              timedOut,
              outputTruncated,
              startedAt:
                metadata.startedAt,
              completedAt:
                new Date().toISOString(),
            });
          },
        );
      },
    );
  }
}
