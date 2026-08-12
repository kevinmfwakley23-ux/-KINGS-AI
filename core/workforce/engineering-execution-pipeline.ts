import type {
  ID,
} from "./types";

import {
  EngineeringExecutionLoopAuthority,
  type EngineeringCommandExecutor,
  type EngineeringExecutionLoopState,
} from "./engineering-execution-loop";

import {
  EngineeringStepExecutor,
  type EngineeringStepExecutionResult,
  type EngineeringStepExecutionRequest,
} from "./engineering-step-executor";

import type {
  AutonomousEngineeringExecution,
} from "./autonomous-engineering-execution";

export interface EngineeringExecutionPipelineRequest {
  request:
    EngineeringStepExecutionRequest;
  execution:
    AutonomousEngineeringExecution;
  completedAt:
    string;
}

export interface EngineeringExecutionPipelineResult {
  id:
    ID;
  execution:
    EngineeringExecutionLoopState;
  step:
    EngineeringStepExecutionResult;
  realExecution:
    boolean;
}

export class EngineeringExecutionPipeline {
  private readonly loop:
    EngineeringExecutionLoopAuthority;

  private readonly stepExecutor:
    EngineeringStepExecutor;

  constructor() {
    this.loop =
      new EngineeringExecutionLoopAuthority();

    this.stepExecutor =
      new EngineeringStepExecutor();
  }

  async execute(
    request:
      EngineeringExecutionPipelineRequest,
    executor:
      EngineeringCommandExecutor,
  ):
    Promise<EngineeringExecutionPipelineResult> {
    const validated =
      this.stepExecutor.execute(
        request.request,
        request.execution,
      );

    const initial =
      this.loop.create(
        request.execution.id,
      );

    const execution =
      await this.loop.execute(
        initial,
        request.request.command,
        executor,
        request.completedAt,
      );

    const attempt =
      execution.attempts[
        execution.attempts.length - 1
      ];

    if (!attempt?.result) {
      throw new Error(
        "K.I.N.G.S. Engineering Execution Pipeline: execution produced no result",
      );
    }

    const result =
      attempt.result;

    return {
      id:
        `pipeline-${request.request.id}`,
      execution,
      step: {
        ...validated,
        started:
          true,
        completed:
          result.status ===
          "success",
        exitCode:
          result.exitCode,
        stdout:
          result.stdout,
        stderr:
          result.stderr,
        evidence: [
          `command:${request.request.command.executable}`,
          `operation:${request.request.command.operation}`,
          `language:${request.request.command.language}`,
          `project:${request.request.projectId}`,
          `execution:${request.request.executionId}`,
          `exit-code:${result.exitCode}`,
          `status:${result.status}`,
        ],
      },
      realExecution:
        true,
    };
  }
}
