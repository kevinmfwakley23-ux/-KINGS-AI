import type {
  ToolchainCommand,
  EngineeringToolchain,
} from "./engineering-toolchain";

import {
  resolveToolchainExecutable,
  type ToolchainExecutableResolutionResult,
} from "./toolchain-executable-resolution";

export interface ToolchainRuntimeEnvironment {
  language:
    EngineeringToolchain["language"];

  commands:
    Record<
      ToolchainCommand["command"],
      ToolchainExecutableResolutionResult
    >;
}

export class ToolchainRuntimeEnvironmentAuthority {
  async resolve(
    toolchain:
      EngineeringToolchain,
    environment?:
      Record<string, string>,
  ):
    Promise<ToolchainRuntimeEnvironment> {
    const uniqueCommands = [
      ...new Set(
        toolchain.commands.map(
          (command) =>
            command.command,
        ),
      ),
    ];

    const commands:
      Record<
        ToolchainCommand["command"],
        ToolchainExecutableResolutionResult
      > = {};

    for (
      const executable of
        uniqueCommands
    ) {
      commands[
        executable
      ] =
        await resolveToolchainExecutable({
          executable,
          environment,
        });
    }

    return {
      language:
        toolchain.language,
      commands,
    };
  }
}
