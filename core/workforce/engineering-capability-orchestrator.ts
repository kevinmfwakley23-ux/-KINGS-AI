import type {
  EngineeringLanguage,
  EngineeringToolchain,
  ToolchainOperation,
} from "./engineering-toolchain";

import {
  EngineeringToolchainRegistry,
} from "./engineering-toolchain";

import {
  ToolchainVerificationAuthority,
  type ToolchainProbe,
  type ToolchainVerificationRequest,
} from "./toolchain-verification";

export interface ToolchainDiscovery {
  discover(language: EngineeringLanguage): Promise<EngineeringToolchain | undefined>;
}

export interface EngineeringCapabilityRequirement {
  language: EngineeringLanguage;
  operations: ToolchainOperation[];
  probes: ToolchainProbe[];
}

export interface EngineeringCapabilityResolution {
  language: EngineeringLanguage;
  available: boolean;
  toolchainId?: string;
  supportedOperations: ToolchainOperation[];
  reason: string;
  missingExecutables: string[];
  unsupportedOperations: ToolchainOperation[];
}

/**
 * Mission-facing bridge across the existing engineering toolchain registry,
 * discovery, verification, and registration authorities.
 *
 * This resolver does not grant terminal or filesystem authority. It only
 * determines whether a verified toolchain can satisfy a bounded requirement.
 */
export class EngineeringCapabilityOrchestrator {
  private readonly verification: ToolchainVerificationAuthority;

  constructor(
    private readonly registry: EngineeringToolchainRegistry,
    private readonly discovery: ToolchainDiscovery,
  ) {
    this.verification = new ToolchainVerificationAuthority(registry);
  }

  async resolve(
    requirement: EngineeringCapabilityRequirement,
  ): Promise<EngineeringCapabilityResolution> {
    const existing = this.registry.get(requirement.language);

    if (existing) {
      const verification = this.verification.verify({
        language: requirement.language,
        requiredOperations: requirement.operations,
        probes: requirement.probes,
      });

      if (verification.verified) {
        return {
          language: requirement.language,
          available: true,
          toolchainId: existing.id,
          supportedOperations: existing.commands.map((command) => command.operation),
          reason: "A registered toolchain satisfies the requested operations and passed executable verification.",
          missingExecutables: [],
          unsupportedOperations: [],
        };
      }

      return {
        language: requirement.language,
        available: false,
        toolchainId: existing.id,
        supportedOperations: existing.commands.map((command) => command.operation),
        reason: `Registered toolchain is missing verified runtime requirements. Missing: ${verification.missingExecutables.join(", ") || "none"}; unsupported operations: ${verification.unsupportedOperations.join(", ") || "none"}.`,
        missingExecutables: [...verification.missingExecutables],
        unsupportedOperations: [...verification.unsupportedOperations],
      };
    }

    const discovered = await this.discovery.discover(requirement.language);

    if (!discovered) {
      return {
        language: requirement.language,
        available: false,
        supportedOperations: [],
        reason: `No toolchain was discovered for ${requirement.language}.`,
        missingExecutables: [],
        unsupportedOperations: [...requirement.operations],
      };
    }

    // Verify a discovered candidate against a temporary registry before it
    // can cross the real registration boundary. This keeps verification
    // deterministic without mutating the production registry on failure.
    const candidateRegistry = new EngineeringToolchainRegistry();
    candidateRegistry.register(discovered);
    const candidateVerification = new ToolchainVerificationAuthority(candidateRegistry);
    const verificationRequest: ToolchainVerificationRequest = {
      language: requirement.language,
      requiredOperations: requirement.operations,
      probes: requirement.probes,
    };
    const verification = candidateVerification.verify(verificationRequest);

    if (!verification.verified) {
      return {
        language: requirement.language,
        available: false,
        toolchainId: discovered.id,
        supportedOperations: discovered.commands.map((command) => command.operation),
        reason: `Discovered toolchain failed verification. Missing: ${verification.missingExecutables.join(", ") || "none"}; unsupported operations: ${verification.unsupportedOperations.join(", ") || "none"}.`,
        missingExecutables: [...verification.missingExecutables],
        unsupportedOperations: [...verification.unsupportedOperations],
      };
    }

    if (this.registry.get(requirement.language)) {
      return {
        language: requirement.language,
        available: false,
        toolchainId: discovered.id,
        supportedOperations: discovered.commands.map((command) => command.operation),
        reason: `A toolchain for ${requirement.language} became registered before discovery completed; registration was not overwritten.`,
        missingExecutables: [],
        unsupportedOperations: [],
      };
    }

    this.registry.register(discovered);

    return {
      language: requirement.language,
      available: true,
      toolchainId: discovered.id,
      supportedOperations: discovered.commands.map((command) => command.operation),
      reason: "Toolchain discovered, verified, and registered for governed engineering use.",
      missingExecutables: [],
      unsupportedOperations: [],
    };
  }
}
