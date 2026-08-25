import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
  EngineeringToolchain,
} from "./engineering-toolchain";

import type {
  EngineeringCommand,
} from "./engineering-workspace";

export interface EngineeringCommandBuildRequest {
  command:
    EngineeringCommand;
  toolchain:
    EngineeringToolchain;
  executableOverrides?:
    Record<string, string>;
}

export interface BuiltEngineeringCommand {
  id:
    ID;
  projectId:
    ID;
  executionStepId:
    ID;
  language:
    EngineeringLanguage;
  operation:
    ToolchainOperation;
  executable:
    string;
  args:
    string[];
  workingDirectory:
    string;
  authorized:
    boolean;
  reason?:
    string;
}

export class EngineeringCommandBuilder {
  build(
    request:
      EngineeringCommandBuildRequest,
  ):
    BuiltEngineeringCommand {
    if (
      !request.command.allowed
    ) {
      return {
        id:
          request.command.id,
        projectId:
          request.command.projectId,
        executionStepId:
          request.command.executionStepId,
        language:
          request.command.language,
        operation:
          request.command.operation,
        executable:
          "",
        args: [],
        workingDirectory:
          request.command.workingDirectory,
        authorized:
          false,
        reason:
          request.command.reason ??
          "Engineering command was not authorized.",
      };
    }

    const definition =
      request.toolchain.commands.find(
        (candidate) =>
          candidate.operation ===
          request.command.operation,
      );

    if (!definition) {
      return {
        id:
          request.command.id,
        projectId:
          request.command.projectId,
        executionStepId:
          request.command.executionStepId,
        language:
          request.command.language,
        operation:
          request.command.operation,
        executable:
          "",
        args: [],
        workingDirectory:
          request.command.workingDirectory,
        authorized:
          false,
        reason:
          `No verified command definition exists for "${request.command.operation}".`,
      };
    }

    return {
      id:
        request.command.id,
      projectId:
        request.command.projectId,
      executionStepId:
        request.command.executionStepId,
      language:
        request.command.language,
      operation:
        request.command.operation,
      executable:
        request.executableOverrides?.[
          definition.command
        ] ?? definition.command,
      args: [
        ...definition.args,
      ],
      workingDirectory:
        request.command.workingDirectory,
      authorized:
        true,
    };
  }
}
