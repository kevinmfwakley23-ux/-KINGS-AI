import type {
  ID,
} from "./types";

import type {
  BuiltEngineeringCommand,
} from "./engineering-command-builder";

export type EngineeringCommandResultStatus =
  | "success"
  | "failed"
  | "blocked";

export interface EngineeringCommandResult {
  id:
    ID;
  commandId:
    ID;
  projectId:
    ID;
  status:
    EngineeringCommandResultStatus;
  exitCode:
    number;
  stdout:
    string;
  stderr:
    string;
  durationMs:
    number;
  completedAt:
    string;
}

export interface EngineeringExecutionAttempt {
  id:
    ID;
  command:
    BuiltEngineeringCommand;
  result?:
    EngineeringCommandResult;
  attemptNumber:
    number;
}

export interface EngineeringExecutionLoopState {
  executionId:
    ID;
  status:
    "ready"
    | "running"
    | "completed"
    | "failed"
    | "blocked";
  attempts:
    EngineeringExecutionAttempt[];
  successfulCommandIds:
    ID[];
  failedCommandIds:
    ID[];
}

export interface EngineeringCommandExecutor {
  execute(
    command:
      BuiltEngineeringCommand,
  ):
    Promise<{
      exitCode:
        number;
      stdout:
        string;
      stderr:
        string;
      durationMs:
        number;
    }>;
}

export class EngineeringExecutionLoopAuthority {
  create(
    executionId:
      ID,
  ):
    EngineeringExecutionLoopState {
    return {
      executionId,
      status:
        "ready",
      attempts: [],
      successfulCommandIds: [],
      failedCommandIds: [],
    };
  }

  async execute(
    state:
      EngineeringExecutionLoopState,
    command:
      BuiltEngineeringCommand,
    executor:
      EngineeringCommandExecutor,
    completedAt:
      string,
  ):
    Promise<EngineeringExecutionLoopState> {
    if (
      !command.authorized
    ) {
      return {
        ...state,
        status:
          "blocked",
        attempts: [
          ...state.attempts,
          {
            id:
              `attempt-${command.id}-${state.attempts.length + 1}`,
            command,
            attemptNumber:
              state.attempts.length + 1,
            result: {
              id:
                `result-${command.id}-${state.attempts.length + 1}`,
              commandId:
                command.id,
              projectId:
                command.projectId,
              status:
                "blocked",
              exitCode:
                -1,
              stdout:
                "",
              stderr:
                command.reason ??
                "Command was not authorized.",
              durationMs:
                0,
              completedAt,
            },
          },
        ],
        successfulCommandIds: [
          ...state.successfulCommandIds,
        ],
        failedCommandIds: [
          ...state.failedCommandIds,
        ],
      };
    }

    const running:
      EngineeringExecutionLoopState =
      {
        ...state,
        status:
          "running",
      };

    const raw =
      await executor.execute(
        command,
      );

    const success =
      raw.exitCode ===
      0;

    const attemptNumber =
      running.attempts.length +
      1;

    const result:
      EngineeringCommandResult =
      {
        id:
          `result-${command.id}-${attemptNumber}`,
        commandId:
          command.id,
        projectId:
          command.projectId,
        status:
          success
            ? "success"
            : "failed",
        exitCode:
          raw.exitCode,
        stdout:
          raw.stdout,
        stderr:
          raw.stderr,
        durationMs:
          raw.durationMs,
        completedAt,
      };

    const attempt:
      EngineeringExecutionAttempt =
      {
        id:
          `attempt-${command.id}-${attemptNumber}`,
        command,
        result,
        attemptNumber,
      };

    return {
      executionId:
        running.executionId,
      status:
        success
          ? "completed"
          : "failed",
      attempts: [
        ...running.attempts,
        attempt,
      ],
      successfulCommandIds:
        success
          ? [
              ...running.successfulCommandIds,
              command.id,
            ]
          : [
              ...running.successfulCommandIds,
            ],
      failedCommandIds:
        success
          ? [
              ...running.failedCommandIds,
            ]
          : [
              ...running.failedCommandIds,
              command.id,
            ],
    };
  }
}
