import type {
  EngineeringLanguage,
  EngineeringToolchain,
  EngineeringToolchainRegistry,
  ToolchainCommand,
  ToolchainOperation,
} from "./engineering-toolchain";

import {
  packageManagerCommandCapability,
} from "./javascript-package-manager-toolchain";

export interface ToolchainProbe {
  executable:
    string;
  available:
    boolean;
  version?:
    string;
  capabilities?:
    string[];
}

export interface ToolchainVerificationRequest {
  language:
    EngineeringLanguage;
  requiredOperations:
    ToolchainOperation[];
  probes:
    ToolchainProbe[];
}

export interface ToolchainVerificationResult {
  language:
    EngineeringLanguage;
  toolchain:
    EngineeringToolchain;
  verified:
    boolean;
  availableExecutables:
    string[];
  missingExecutables:
    string[];
  missingCapabilities?:
    string[];
  unsupportedOperations:
    ToolchainOperation[];
}

export class ToolchainVerificationAuthority {
  constructor(
    private readonly registry:
      EngineeringToolchainRegistry,
  ) {}

  verify(
    request:
      ToolchainVerificationRequest,
  ):
    ToolchainVerificationResult {
    const discovery =
      this.registry.discover({
        language:
          request.language,
        requiredOperations:
          request.requiredOperations,
      });

    const availableExecutables =
      new Set(
        request.probes
          .filter(
            (probe) =>
              probe.available,
          )
          .map(
            (probe) =>
              probe.executable,
          ),
      );

    const availableCapabilities =
      new Set(
        request.probes
          .filter(
            (probe) =>
              probe.available,
          )
          .flatMap(
            (probe) =>
              probe.capabilities ?? [],
          ),
      );

    const requiredCommands =
      discovery.toolchain.commands.filter(
        (command) =>
          request.requiredOperations.includes(
            command.operation,
          ),
      );

    const missingExecutables =
      [
        ...new Set(
          requiredCommands.map(
            (command) =>
              command.command,
          ),
        ),
      ].filter(
        (executable) =>
          !availableExecutables.has(
            executable,
          ),
      );

    const missingCapabilities =
      [
        ...new Set(
          requiredCommands.flatMap(
            requiredCommandCapabilities,
          ),
        ),
      ].filter(
        (capability) =>
          !availableCapabilities.has(
            capability,
          ),
      );

    return {
      language:
        request.language,
      toolchain:
        discovery.toolchain,
      verified:
        discovery.supported &&
        missingExecutables.length ===
          0 &&
        missingCapabilities.length ===
          0,
      availableExecutables:
        [
          ...availableExecutables,
        ].sort(),
      missingExecutables,
      missingCapabilities,
      unsupportedOperations:
        discovery.missingOperations,
    };
  }
}

function requiredCommandCapabilities(
  command:
    ToolchainCommand,
): string[] {
  const capabilities: string[] = [];

  const moduleIndex =
    command.args.indexOf(
      "-m",
    );

  if (
    moduleIndex >= 0 &&
    command.args[
      moduleIndex + 1
    ]
  ) {
    capabilities.push(
      `python-module:${command.args[moduleIndex + 1]}`,
    );
  }

  const packageManagerCapability =
    packageManagerCommandCapability(command);
  if (packageManagerCapability) {
    capabilities.push(packageManagerCapability);
  }

  return capabilities;
}
