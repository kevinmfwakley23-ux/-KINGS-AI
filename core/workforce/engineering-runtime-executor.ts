import {
  ExecutionSandbox,
  type SandboxPolicy,
} from "./execution-sandbox";

import type {
  BuiltEngineeringCommand,
} from "./engineering-command-builder";

import type {
  EngineeringCommandExecutor,
} from "./engineering-execution-loop";

export interface EngineeringRuntimeExecutorOptions {
  sandboxPolicy:
    SandboxPolicy;
}

export class EngineeringRuntimeExecutor
  implements EngineeringCommandExecutor {
  private readonly sandbox:
    ExecutionSandbox;

  constructor(
    options:
      EngineeringRuntimeExecutorOptions,
  ) {
    this.sandbox =
      new ExecutionSandbox(
        options.sandboxPolicy,
      );
  }

  async execute(
    command:
      BuiltEngineeringCommand,
  ): Promise<{
    exitCode:
      number;
    stdout:
      string;
    stderr:
      string;
    durationMs:
      number;
  }> {
    if (
      !command.authorized
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Runtime Executor: unauthorized command",
      );
    }

    const result =
      await this.sandbox.execute({
        command:
          command.executable,
        args:
          command.args,
        workingDirectory:
          command.workingDirectory,
        sideEffects: [
          "read",
          "execute",
          "write",
        ],
      });

    if (
      result.exitCode ===
      null
    ) {
      throw new Error(
        result.timedOut
          ? "K.I.N.G.S. Engineering Runtime Executor: process timed out"
          : `K.I.N.G.S. Engineering Runtime Executor: process terminated by signal ${String(result.signal)}`,
      );
    }

    const durationMs =
      Math.max(
        0,
        new Date(
          result.completedAt,
        ).getTime() -
          new Date(
            result.startedAt,
          ).getTime(),
      );

    return {
      exitCode:
        result.exitCode,
      stdout:
        result.stdout,
      stderr:
        result.stderr,
      durationMs,
    };
  }
}
