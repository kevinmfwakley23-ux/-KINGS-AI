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

export interface SandboxBubblewrapIsolation {
  kind: "bubblewrap";
  executable: string;
  additionalReadOnlyPaths?: string[];
}

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
  processIsolation?: SandboxBubblewrapIsolation;
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

    if (policy.processIsolation) {
      if (policy.processIsolation.kind !== "bubblewrap") {
        throw new ExecutionSandboxPolicyError(
          "unsupported process isolation backend",
        );
      }
      if (!policy.processIsolation.executable.trim()) {
        throw new ExecutionSandboxPolicyError(
          "bubblewrap isolation requires an executable path",
        );
      }
      if (policy.processIsolation.additionalReadOnlyPaths) {
        assertStringArray(
          policy.processIsolation.additionalReadOnlyPaths,
          "processIsolation.additionalReadOnlyPaths",
        );
      }
    }

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

    const invocation = this.buildInvocation(
      command,
      args,
      workingDirectory,
      request.sideEffects ?? ["read"],
    );

    this.activeProcesses +=
      1;

    try {
      const child =
        this.spawnProcess(
          invocation.command,
          invocation.args,
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

  private buildInvocation(
    command: string,
    args: string[],
    workingDirectory: string,
    sideEffects: SandboxSideEffect[],
  ): { command: string; args: string[] } {
    const isolation = this.policy.processIsolation;
    if (!isolation) {
      return { command, args };
    }

    const networkRequested = sideEffects.includes("network");
    const bwrapArgs: string[] = [
      "--die-with-parent",
      "--new-session",
      "--unshare-all",
    ];
    if (networkRequested && this.policy.allowNetwork) {
      bwrapArgs.push("--share-net");
    }

    bwrapArgs.push(
      "--ro-bind", "/usr", "/usr",
      "--ro-bind-try", "/opt", "/opt",
      "--symlink", "usr/bin", "/bin",
      "--symlink", "usr/sbin", "/sbin",
      "--symlink", "usr/lib", "/lib",
      "--symlink", "usr/lib64", "/lib64",
      "--dir", "/etc",
      "--ro-bind-try", "/etc/ld.so.cache", "/etc/ld.so.cache",
      "--ro-bind-try", "/etc/resolv.conf", "/etc/resolv.conf",
      "--ro-bind-try", "/etc/hosts", "/etc/hosts",
      "--ro-bind-try", "/etc/nsswitch.conf", "/etc/nsswitch.conf",
      "--ro-bind-try", "/etc/passwd", "/etc/passwd",
      "--ro-bind-try", "/etc/group", "/etc/group",
      "--ro-bind-try", "/etc/ssl", "/etc/ssl",
      "--ro-bind-try", "/etc/ca-certificates.conf", "/etc/ca-certificates.conf",
      "--ro-bind-try", "/etc/localtime", "/etc/localtime",
      "--proc", "/proc",
      "--dev", "/dev",
      "--tmpfs", "/tmp",
      "--dir", "/tmp/kings-home",
      "--dir", "/var",
      "--symlink", "../tmp", "/var/tmp",
      "--dir", "/run",
      "--ro-bind-try", "/sys", "/sys",
    );

    const writeRoots = uniqueStrings(
      this.policy.allowedWritePaths.map(normalizePath),
    );
    const readRoots = uniqueStrings(
      this.policy.allowedReadPaths.map(normalizePath),
    ).filter((readRoot) =>
      !writeRoots.some((writeRoot) => isPathWithin(readRoot, writeRoot)),
    );

    for (const path of readRoots) {
      bwrapArgs.push("--ro-bind-try", path, path);
    }
    for (const path of writeRoots) {
      bwrapArgs.push("--bind", path, path);
    }
    for (const path of uniqueStrings(
      (isolation.additionalReadOnlyPaths ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
        .map(normalizePath),
    )) {
      if (
        !writeRoots.some((writeRoot) => isPathWithin(path, writeRoot)) &&
        !readRoots.some((readRoot) => isPathWithin(path, readRoot))
      ) {
        bwrapArgs.push("--ro-bind-try", path, path);
      }
    }

    bwrapArgs.push(
      "--setenv", "HOME", "/tmp/kings-home",
      "--setenv", "TMPDIR", "/tmp",
      "--setenv", "TMP", "/tmp",
      "--setenv", "TEMP", "/tmp",
      "--chdir", workingDirectory,
      "--",
      command,
      ...args,
    );

    return {
      command: normalizePath(isolation.executable),
      args: bwrapArgs,
    };
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

    if (this.policy.processIsolation) {
      result.HOME = "/tmp/kings-home";
      result.TMPDIR = "/tmp";
      result.TMP = "/tmp";
      result.TEMP = "/tmp";
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
