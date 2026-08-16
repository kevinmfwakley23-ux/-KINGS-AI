import type {
  BuiltEngineeringCommand,
} from "./engineering-command-builder";

import type {
  EngineeringCommandExecutor,
} from "./engineering-execution-loop";

import {
  LocalCodingWorker,
} from "./local-coding-worker";

export interface LocalCodingEngineeringExecutorOptions {
  worker?:
    LocalCodingWorker;
}

export class LocalCodingEngineeringExecutor
  implements EngineeringCommandExecutor {
  private readonly worker:
    LocalCodingWorker;

  constructor(
    options:
      LocalCodingEngineeringExecutorOptions = {},
  ) {
    this.worker =
      options.worker ??
      new LocalCodingWorker();
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
    const startedAt =
      Date.now();

    const targetPath =
      `${command.workingDirectory}/generated/kings-output.ts`;

    const result =
      await this.worker.execute({
        id:
          `local-engineering-${command.id}`,

        taskId:
          command.id,

        missionId:
          command.projectId,

        instruction:
          `${command.operation} ${command.executable} ${command.args.join(" ")}`
            .trim(),

        workspacePath:
          command.workingDirectory,

        targetPath,

        allowedReadPaths: [
          command.workingDirectory,
          targetPath,
        ],

        allowedWritePaths: [
          targetPath,
        ],

        maxFileBytes:
          128 *
          1024,

        maxOutputTokens:
          1024,
      });

    const durationMs =
      Date.now() -
      startedAt;

    if (
      result.success
    ) {
      return {
        exitCode:
          0,

        stdout:
          [
            "K.I.N.G.S. LOCAL CODING MASTER: SUCCESS",
            ...result.writtenPaths.map(
              (
                path,
              ) =>
                `WROTE: ${path}`,
            ),
            ...result.reasons,
          ].join("\n"),

        stderr:
          "",

        durationMs,
      };
    }

    return {
      exitCode:
        1,

      stdout:
        [
          "K.I.N.G.S. LOCAL CODING MASTER: FAILED",
          ...result.writtenPaths.map(
            (
              path,
            ) =>
              `WROTE: ${path}`,
          ),
        ].join("\n"),

      stderr:
        result.reasons.join(
          "\n",
        ),

      durationMs,
    };
  }
}
