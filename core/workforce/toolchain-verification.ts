import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  EngineeringToolchain,
  EngineeringToolchainRegistry,
  ToolchainOperation,
} from "./engineering-toolchain";

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
      requiredCommands.flatMap(
        (command) => {
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
            const module =
              command.args[
                moduleIndex + 1
              ];

            return availableCapabilities.has(
              module,
            )
              ? []
              : [module];
          }

          return [];
        },
      );

    const allMissing =
      [
        ...missingExecutables,
        ...missingCapabilities,
      ];

    return {
      language:
        request.language,
      toolchain:
        discovery.toolchain,
      verified:
        discovery.supported &&
        allMissing.length ===
          0,
      availableExecutables:
        [
          ...availableExecutables,
        ],
      missingExecutables:
        allMissing,
      unsupportedOperations:
        discovery.missingOperations,
    };
  }
}
