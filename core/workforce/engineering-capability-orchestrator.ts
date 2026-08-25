import type {
  EngineeringLanguage,
  EngineeringToolchain,
  ToolchainOperation,
} from "./engineering-toolchain";

import {
  EngineeringToolchainRegistry,
} from "./engineering-toolchain";

import {
  ToolchainVerification,
  type ToolchainVerificationRequest,
} from "./toolchain-verification";

import {
  DynamicToolchainRegistrationAuthority,
} from "./dynamic-toolchain-registration";

export interface ToolchainDiscovery {
  discover(language: EngineeringLanguage): Promise<EngineeringToolchain | undefined>;
}

export interface EngineeringCapabilityRequirement {
  language: EngineeringLanguage;
  operations: ToolchainOperation[];
}

export interface EngineeringCapabilityResolution {
  language: EngineeringLanguage;
  available: boolean;
  toolchainId?: string;
  supportedOperations: ToolchainOperation[];
  reason: string;
}

/**
 * Governs the existing toolchain discovery/verification/registration pieces
 * as a single mission-facing capability-resolution operation.
 *
 * This does not grant terminal or filesystem authority. It only answers
 * whether a verified toolchain capable of the requested operations exists.
 */
export class EngineeringCapabilityOrchestrator {
  private readonly verification: ToolchainVerification;
  private readonly registration: DynamicToolchainRegistrationAuthority;

  constructor(
    private readonly registry: EngineeringToolchainRegistry,
    private readonly discovery: ToolchainDiscovery,
  ) {
    this.verification = new ToolchainVerification();
    this.registration = new DynamicToolchainRegistrationAuthority(registry);
  }

  async resolve(
    requirement: EngineeringCapabilityRequirement,
  ): Promise<EngineeringCapabilityResolution> {
    const existing = this.registry.get(requirement.language);
    if (existing) {
      const supported = existing.commands.map((command) => command.operation);
      const missing = requirement.operations.filter(
        (operation) => !supported.includes(operation),
      );

      if (missing.length === 0) {
        return {
          language: requirement.language,
          available: true,
          toolchainId: existing.id,
          supportedOperations: supported,
          reason: "A registered toolchain already satisfies the requested operations.",
        };
      }
    }

    const discovered = await this.discovery.discover(requirement.language);
    if (!discovered) {
      return {
        language: requirement.language,
        available: false,
        supportedOperations: [],
        reason: `No toolchain was discovered for ${requirement.language}.`,
      };
    }

    const verificationRequest: ToolchainVerificationRequest = {
      toolchain: discovered,
      requiredOperations: requirement.operations,
    };

    const verification = await this.verification.verify(verificationRequest);
    if (!verification.verified) {
      return {
        language: requirement.language,
        available: false,
        toolchainId: discovered.id,
        supportedOperations: [],
        reason: verification.reason,
      };
    }

    const registered = this.registration.register({
      toolchain: discovered,
      verification,
      requiredOperations: requirement.operations,
    });

    return {
      language: requirement.language,
      available: registered.registered,
      toolchainId: discovered.id,
      supportedOperations: registered.supportedOperations,
      reason: "Toolchain discovered, verified, and registered for governed engineering use.",
    };
  }
}
