import type {
  AutonomousEngineeringExecution,
} from "./autonomous-engineering-execution";

import {
  EngineeringStepExecutor,
  type EngineeringStepExecutionRequest,
  type EngineeringStepExecutionResult,
} from "./engineering-step-executor";

import {
  LocalCodingWorker,
} from "./local-coding-worker";

export interface LocalCodingEngineeringStepExecutorOptions {
  worker?:
    LocalCodingWorker;
}

export class LocalCodingEngineeringStepExecutor {
  private readonly validator:
    EngineeringStepExecutor;

  private readonly worker:
    LocalCodingWorker;

  constructor(
    options:
      LocalCodingEngineeringStepExecutorOptions = {},
  ) {
    this.validator =
      new EngineeringStepExecutor();

    this.worker =
      options.worker ??
      new LocalCodingWorker();
  }

  async execute(
    request:
      EngineeringStepExecutionRequest,
    execution:
      AutonomousEngineeringExecution,
  ):
    Promise<
      EngineeringStepExecutionResult
    > {
    const validated =
      this.validator.execute(
        request,
        execution,
      );

    const workerResult =
      await this.worker.execute({
        id:
          request.id,

        taskId:
          request.step.id,

        missionId:
          request.projectId,

        instruction:
          request.engineeringIntent,

        workspacePath:
          request.command.workingDirectory,

        allowedReadPaths: [
          request.command.workingDirectory,
        ],

        allowedWritePaths: [
          request.command.workingDirectory,
          `${request.command.workingDirectory}/generated`,
        ],

        maxFileBytes:
          128 *
          1024,

        maxOutputTokens:
          1024,
      });

    if (
      !workerResult.success
    ) {
      return {
        ...validated,

        completed:
          false,

        exitCode:
          1,

        stdout:
          workerResult.writtenPaths.join(
            "\n",
          ),

        stderr:
          workerResult.reasons.join(
            "\n",
          ),

        evidence: [
          ...validated.evidence,
          "local-coding-worker:failed",
        ],
      };
    }

    return {
      ...validated,

      completed:
        true,

      exitCode:
        0,

      stdout:
        workerResult.writtenPaths.join(
          "\n",
        ),

      stderr:
        "",

      evidence: [
        ...validated.evidence,
        "local-coding-worker:success",
        ...workerResult.writtenPaths.map(
          (
            path,
          ) =>
            `written:${path}`,
        ),
      ],
    };
  }
}
