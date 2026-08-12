import {
  ExecutionSandbox,
  ExecutionSandboxPolicyError,
  EXECUTION_SANDBOX_TOOL_ID,
} from "./execution-sandbox";

import type {
  SandboxProcess,
  SandboxSpawner,
} from "./execution-sandbox";

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

class FakeStream {
  private listeners:
    Record<
      string,
      Array<
        (...args: any[]) => void
      >
    > = {};

  on(
    event:
      string,
    listener:
      (...args: any[]) => void,
  ): this {
    (
      this.listeners[event] ??=
        []
    ).push(
      listener,
    );

    return this;
  }

  emit(
    event:
      string,
    ...args:
      any[]
  ): void {
    for (
      const listener of
        this.listeners[
          event
        ] ?? []
    ) {
      listener(
        ...args,
      );
    }
  }
}

class FakeProcess
  implements SandboxProcess {
  stdout =
    new FakeStream() as unknown as NodeJS.ReadableStream;

  stderr =
    new FakeStream() as unknown as NodeJS.ReadableStream;

  private listeners:
    Record<
      string,
      Array<
        (...args: any[]) => void
      >
    > = {};

  killed =
    false;

  kill(
    signal?:
      NodeJS.Signals,
  ): boolean {
    this.killed =
      true;

    queueMicrotask(
      () =>
        this.emit(
          "close",
          null,
          signal ??
            "SIGTERM",
        ),
    );

    return true;
  }

  once(
    event:
      string,
    listener:
      (...args: any[]) => void,
  ): this {
    (
      this.listeners[event] ??=
        []
    ).push(
      listener,
    );

    return this;
  }

  emit(
    event:
      string,
    ...args:
      any[]
  ): void {
    const listeners =
      this.listeners[
        event
      ] ?? [];

    this.listeners[event] =
      [];

    for (
      const listener of
        listeners
    ) {
      listener(
        ...args,
      );
    }
  }

  succeed(
    stdout:
      string,
    stderr:
      string,
    exitCode:
      number,
  ): void {
    (
      this.stdout as unknown as FakeStream
    ).emit(
      "data",
      Buffer.from(
        stdout,
        "utf8",
      ),
    );

    (
      this.stderr as unknown as FakeStream
    ).emit(
      "data",
      Buffer.from(
        stderr,
        "utf8",
      ),
    );

    queueMicrotask(
      () =>
        this.emit(
          "close",
          exitCode,
          null,
        ),
    );
  }
}

function createSpawner(
  callback:
    (
      process:
        FakeProcess,
      command:
        string,
      args:
        string[],
      options:
        {
          cwd:
            string;
          env:
            Record<
              string,
              string
            >;
          shell:
            false;
        },
    ) => void,
): SandboxSpawner {
  return (
    command,
    args,
    options,
  ) => {
    const process =
      new FakeProcess();

    callback(
      process,
      command,
      args,
      options,
    );

    return process;
  };
}

function createSandbox(
  spawner?:
    SandboxSpawner,
) {
  return new ExecutionSandbox(
    {
      allowedCommands: [
        "node",
        "git",
      ],
      allowedWorkingDirectories: [
        "/workspace/project",
      ],
      allowedReadPaths: [
        "/workspace/project",
      ],
      allowedWritePaths: [
        "/workspace/project/build",
      ],
      allowedEnvironmentKeys: [
        "NODE_ENV",
      ],
      allowedSideEffects: [
        "read",
        "execute",
      ],
      timeoutMs:
        1000,
      maxOutputBytes:
        1024,
      maxConcurrentProcesses:
        2,
      allowShell:
        false,
      allowNetwork:
        false,
    },
    spawner,
  );
}

async function runTest(): Promise<void> {
  assert(
    EXECUTION_SANDBOX_TOOL_ID ===
      "tool-execution-sandbox",
    "Execution sandbox tool identity is incorrect.",
  );

  console.log(
    "04.8 execution sandbox identity: SUCCESS",
  );

  const fake =
    new FakeProcess();

  const sandbox =
    createSandbox(
      createSpawner(
        (
          process,
        ) => {
          queueMicrotask(
            () =>
              process.succeed(
                "sandbox-ok",
                "",
                0,
              ),
          );
        },
      ),
    );

  const result =
    await sandbox.execute({
      command:
        "node",
      args: [
        "--version",
      ],
      workingDirectory:
        "/workspace/project",
      environment: {
        NODE_ENV:
          "test",
      },
      sideEffects: [
        "read",
        "execute",
      ],
    });

  assert(
    result.exitCode ===
      0,
    "Authorized process did not complete successfully.",
  );

  assert(
    result.stdout ===
      "sandbox-ok",
    "Authorized stdout was not preserved.",
  );

  console.log(
    "04.8 authorized execution: SUCCESS",
  );

  let commandRejected =
    false;

  try {
    await sandbox.execute({
      command:
        "bash",
      args: [
        "-c",
        "echo unsafe",
      ],
      workingDirectory:
        "/workspace/project",
    });
  } catch (
    error: unknown
  ) {
    commandRejected =
      error instanceof
        ExecutionSandboxPolicyError &&
      error.message.includes(
        "not authorized",
      );
  }

  assert(
    commandRejected,
    "Unauthorized command was not rejected.",
  );

  console.log(
    "04.8 command authorization boundary: SUCCESS",
  );

  let shellRejected =
    false;

  try {
    new ExecutionSandbox({
      allowedCommands: [
        "node",
      ],
      allowedWorkingDirectories: [
        "/workspace/project",
      ],
      allowedReadPaths: [
        "/workspace/project",
      ],
      allowedWritePaths: [],
      allowedEnvironmentKeys: [],
      allowedSideEffects: [
        "read",
        "execute",
      ],
      timeoutMs:
        1000,
      maxOutputBytes:
        1000,
      maxConcurrentProcesses:
        1,
      allowShell:
        true,
      allowNetwork:
        false,
    });
  } catch (
    error: unknown
  ) {
    shellRejected =
      error instanceof
        ExecutionSandboxPolicyError &&
      error.message.includes(
        "shell execution",
      );
  }

  assert(
    shellRejected,
    "Shell execution was not permanently disabled.",
  );

  console.log(
    "04.8 shell execution boundary: SUCCESS",
  );

  let workingDirectoryRejected =
    false;

  try {
    await sandbox.execute({
      command:
        "node",
      workingDirectory:
        "/tmp",
    });
  } catch (
    error: unknown
  ) {
    workingDirectoryRejected =
      error instanceof
        ExecutionSandboxPolicyError &&
      error.message.includes(
        "working directory",
      );
  }

  assert(
    workingDirectoryRejected,
    "Unauthorized working directory was not rejected.",
  );

  console.log(
    "04.8 working-directory boundary: SUCCESS",
  );

  let environmentRejected =
    false;

  try {
    await sandbox.execute({
      command:
        "node",
      workingDirectory:
        "/workspace/project",
      environment: {
        SECRET:
          "should-not-pass",
      },
    });
  } catch (
    error: unknown
  ) {
    environmentRejected =
      error instanceof
        ExecutionSandboxPolicyError &&
      error.message.includes(
        "environment key",
      );
  }

  assert(
    environmentRejected,
    "Unauthorized environment variable was not rejected.",
  );

  console.log(
    "04.8 environment boundary: SUCCESS",
  );

  let writeRejected =
    false;

  try {
    await sandbox.execute({
      command:
        "node",
      workingDirectory:
        "/workspace/project",
      sideEffects: [
        "write",
      ],
    });
  } catch (
    error: unknown
  ) {
    writeRejected =
      error instanceof
        ExecutionSandboxPolicyError &&
      error.message.includes(
        "side effect",
      );
  }

  assert(
    writeRejected,
    "Unauthorized write side effect was not rejected.",
  );

  console.log(
    "04.8 write-side-effect boundary: SUCCESS",
  );

  let networkRejected =
    false;

  try {
    await sandbox.execute({
      command:
        "node",
      workingDirectory:
        "/workspace/project",
      sideEffects: [
        "network",
      ],
    });
  } catch (
    error: unknown
  ) {
    networkRejected =
      error instanceof
        ExecutionSandboxPolicyError &&
      error.message.includes(
        "network",
      );
  }

  assert(
    networkRejected,
    "Network side effect was not rejected.",
  );

  console.log(
    "04.8 network boundary: SUCCESS",
  );

  let newlineRejected =
    false;

  try {
    await sandbox.execute({
      command:
        "node\nrm",
      workingDirectory:
        "/workspace/project",
    });
  } catch (
    error: unknown
  ) {
    newlineRejected =
      error instanceof
        ExecutionSandboxPolicyError &&
      error.message.includes(
        "newline",
      );
  }

  assert(
    newlineRejected,
    "Command newline injection was not rejected.",
  );

  console.log(
    "04.8 command injection boundary: SUCCESS",
  );

  let concurrentRejected =
    false;

  const activeProcesses = [
    new FakeProcess(),
    new FakeProcess(),
  ];

  let processIndex =
    0;

  const concurrencySandbox =
    createSandbox(
      createSpawner(
        () =>
          activeProcesses[
            processIndex++
          ],
      ),
    );

  const firstExecution =
    concurrencySandbox.execute({
      command:
        "node",
      workingDirectory:
        "/workspace/project",
    });

  const secondExecution =
    concurrencySandbox.execute({
      command:
        "git",
      workingDirectory:
        "/workspace/project",
    });

  await Promise.resolve();

  try {
    await concurrencySandbox.execute({
      command:
        "git",
      workingDirectory:
        "/workspace/project",
    });
  } catch (
    error: unknown
  ) {
    concurrentRejected =
      error instanceof
        ExecutionSandboxPolicyError &&
      error.message.includes(
        "concurrent",
      );
  }

  activeProcesses[0].kill(
    "SIGTERM",
  );

  activeProcesses[1].kill(
    "SIGTERM",
  );

  await Promise.all([
    firstExecution,
    secondExecution,
  ]);

  assert(
    concurrentRejected,
    "Concurrent process limit was not enforced.",
  );

  console.log(
    "04.8 concurrency budget boundary: SUCCESS",
  );

  let timeoutProcess:
    FakeProcess | undefined;

  const timeoutSandbox =
    createSandbox(
      createSpawner(
        (
          process,
        ) => {
          timeoutProcess =
            process;
        },
      ),
    );

  const timeoutResult =
    await timeoutSandbox.execute({
      command:
        "node",
      workingDirectory:
        "/workspace/project",
    });

  assert(
    timeoutResult.timedOut ===
      true,
    "Execution timeout was not enforced.",
  );

  assert(
    timeoutProcess?.killed ===
      true,
    "Timed-out process was not terminated.",
  );

  console.log(
    "04.8 execution timeout boundary: SUCCESS",
  );

  let outputProcess:
    FakeProcess | undefined;

  const outputSandbox =
    new ExecutionSandbox(
      {
        allowedCommands: [
          "node",
        ],
        allowedWorkingDirectories: [
          "/workspace/project",
        ],
        allowedReadPaths: [
          "/workspace/project",
        ],
        allowedWritePaths: [],
        allowedEnvironmentKeys: [],
        allowedSideEffects: [
          "read",
          "execute",
        ],
        timeoutMs:
          1000,
        maxOutputBytes:
          8,
        maxConcurrentProcesses:
          1,
        allowShell:
          false,
        allowNetwork:
          false,
      },
      createSpawner(
        (
          process,
        ) => {
          outputProcess =
            process;
        },
      ),
    );

  const outputExecution =
    outputSandbox.execute({
      command:
        "node",
      workingDirectory:
        "/workspace/project",
    });

  outputProcess!.succeed(
    "123456789012345",
    "",
    0,
  );

  const outputResult =
    await outputExecution;

  assert(
    outputResult.outputTruncated ===
      true,
    "Output size limit was not enforced.",
  );

  assert(
    Buffer.byteLength(
      outputResult.stdout,
      "utf8",
    ) <=
      8,
    "Sandbox output exceeded configured limit.",
  );

  console.log(
    "04.8 output budget boundary: SUCCESS",
  );

  console.log(
    "TREE-04.8 EXECUTION SANDBOX: SUCCESS",
  );
}

runTest().catch(
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
