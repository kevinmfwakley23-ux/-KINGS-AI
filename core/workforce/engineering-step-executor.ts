import type { ID } from "./types";
import type {
  AutonomousEngineeringExecution,
  EngineeringExecutionStep,
} from "./autonomous-engineering-execution";
import type { BuiltEngineeringCommand } from "./engineering-command-builder";
import { EngineeringExecutionLoopAuthority } from "./engineering-execution-loop";
import { EngineeringRuntimeExecutor } from "./engineering-runtime-executor";

export interface EngineeringStepExecutionRequest {
  id: ID;
  projectId: ID;
  executionId: ID;
  step: EngineeringExecutionStep;
  command: BuiltEngineeringCommand;
}

export interface EngineeringStepExecutionResult {
  id: ID;
  projectId: ID;
  executionId: ID;
  stepId: ID;
  started: boolean;
  completed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  evidence: string[];
}

export class EngineeringStepExecutor {
  constructor(
    private readonly runtime = new EngineeringExecutionLoopAuthority(),
  ) {}

  async execute(
    request: EngineeringStepExecutionRequest,
    execution: AutonomousEngineeringExecution,
  ): Promise<EngineeringStepExecutionResult> {
    this.validate(request, execution);

    if (!request.command.authorized) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: command is not authorized",
      );
    }

    const executor = new EngineeringRuntimeExecutor({
      sandboxPolicy: {
        allowedCommands: [request.command.executable],
        allowedWorkingDirectories: [request.command.workingDirectory],
        allowedReadPaths: [request.command.workingDirectory],
        allowedWritePaths: [request.command.workingDirectory],
        allowedEnvironmentKeys: [],
        allowedSideEffects: ["read", "execute", "write"],
        timeoutMs: 120_000,
        maxOutputBytes: 1_048_576,
        maxConcurrentProcesses: 1,
        allowShell: false,
        allowNetwork: false,
      },
    });

    const state = this.runtime.create(request.executionId);
    const completed = await this.runtime.execute(
      state,
      request.command,
      executor,
      new Date().toISOString(),
    );

    const attempt = completed.attempts[completed.attempts.length - 1];
    if (!attempt?.result) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: runtime execution produced no result",
      );
    }

    return {
      id: request.id,
      projectId: request.projectId,
      executionId: request.executionId,
      stepId: request.step.id,
      started: true,
      completed: attempt.result.status === "success",
      exitCode: attempt.result.exitCode,
      stdout: attempt.result.stdout,
      stderr: attempt.result.stderr,
      evidence: [
        `command:${request.command.executable}`,
        `operation:${request.command.operation}`,
        `language:${request.command.language}`,
        `durationMs:${attempt.result.durationMs}`,
        `status:${attempt.result.status}`,
        `completedAt:${attempt.result.completedAt}`,
      ],
    };
  }

  private validate(
    request: EngineeringStepExecutionRequest,
    execution: AutonomousEngineeringExecution,
  ): void {
    if (execution.projectId !== request.projectId) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: execution project does not match request project",
      );
    }

    if (execution.id !== request.executionId) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: execution identity does not match request",
      );
    }

    if (execution.status === "blocked") {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: blocked execution cannot execute a step",
      );
    }

    if (execution.currentStepId !== request.step.id) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: requested step is not the current governed step",
      );
    }

    if (request.step.language !== request.command.language) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: command language does not match engineering step",
      );
    }

    if (request.step.operation !== request.command.operation) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: command operation does not match engineering step",
      );
    }
  }
}
