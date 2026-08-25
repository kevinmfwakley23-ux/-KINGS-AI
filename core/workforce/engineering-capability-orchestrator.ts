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
  probes: {
    executable: string;
    available: boolean;
    version?: string;
    capabilities?: string[];
  }[];
}

export interface EngineeringCapabilityResolution {
  language: EngineeringLanguage;
  available: boolean;
  toolchainId?: string;
  supportedOperations: ToolchainOperation[];
  reason: string;
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
  private readonly registration: DynamicToolchainRegistrationAuthority;

  constructor(
    private readonly registry: EngineeringToolchainRegistry,
    private readonly discovery: ToolchainDiscovery,
  ) {
    this.verification = new ToolchainVerificationAuthority(registry);
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
        const verificationRequest: ToolchainVerificationRequest = {
          language: requirement.language,
          requiredOperations: requirement.operations,
          probes: requirement.probes,
        };
        const verification = this.verification.verify(verificationRequest);
        if (verification.verified) {
          return {
            language: requirement.language,
            available: true,
            toolchainId: existing.id,
            supportedOperations: supported,
            reason: "A registered toolchain already satisfies the requested operations and passed executable verification.",
          };
        }
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

    const verificationRegistry = new EngineeringToolchainRegistry();
    verificationRegistry.register(discovered);
    const verifier = new ToolchainVerificationAuthority(verificationRegistry);
    const verificationRequest: ToolchainVerificationRequest = {
      language: requirement.language,
      requiredOperations: requirement.operations,
      probes: requirement.probes,
    };
    const verification = verifier.verify(verificationRequest);

    if (!verification.verified) {
      return {
        language: requirement.language,
        available: false,
        toolchainId: discovered.id,
        supportedOperations: [],
        reason: `Discovered toolchain failed verification. Missing executables/capabilities: ${verification.missingExecutables.join(", ") || "none"}. Unsupported operations: ${verification.unsupportedOperations.join(", ") || "none"}.`,
      };
    }

    const registration = new DynamicToolchainRegistrationAuthority(this.registry);
    const registered = registration.register({
      toolchain: discovered,
      verification: {
        ...verification,
        toolchain: discovered,
      },
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
