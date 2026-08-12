import type {
  ID,
} from "./types";

import type {
  AutonomousEngineeringExecution,
  EngineeringExecutionStep,
} from "./autonomous-engineering-execution";

import type {
  BuiltEngineeringCommand,
} from "./engineering-command-builder";

export interface EngineeringStepExecutionRequest {
  id:
    ID;
  projectId:
    ID;
  executionId:
    ID;
  step:
    EngineeringExecutionStep;
  command:
    BuiltEngineeringCommand;
}

export interface EngineeringStepExecutionResult {
  id:
    ID;
  projectId:
    ID;
  executionId:
    ID;
  stepId:
    ID;
  started:
    boolean;
  completed:
    boolean;
  exitCode:
    number;
  stdout:
    string;
  stderr:
    string;
  evidence:
    string[];
}

export class EngineeringStepExecutor {
  execute(
    request:
      EngineeringStepExecutionRequest,
    execution:
      AutonomousEngineeringExecution,
  ):
    EngineeringStepExecutionResult {
    if (
      execution.projectId !==
      request.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: execution project does not match request project",
      );
    }

    if (
      execution.id !==
      request.executionId
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: execution identity does not match request",
      );
    }

    if (
      execution.status ===
      "blocked"
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: blocked execution cannot execute a step",
      );
    }

    if (
      execution.currentStepId !==
      request.step.id
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: requested step is not the current governed step",
      );
    }

    if (
      request.step.language !==
      request.command.language
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: command language does not match engineering step",
      );
    }

    if (
      request.step.operation !==
      request.command.operation
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Step Executor: command operation does not match engineering step",
      );
    }

    return {
      id:
        request.id,
      projectId:
        request.projectId,
      executionId:
        request.executionId,
      stepId:
        request.step.id,
      started:
        true,
      completed:
        true,
      exitCode:
        0,
      stdout:
        "",
      stderr:
        "",
      evidence: [
        `command:${request.command.executable}`,
        `operation:${request.command.operation}`,
        `language:${request.command.language}`,
      ],
    };
  }
}
