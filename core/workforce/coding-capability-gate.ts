import type {
  EngineeringLanguage,
  EngineeringToolchain,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  ToolchainProbe,
} from "./toolchain-verification";

import {
  EngineeringCapabilityOrchestrator,
} from "./engineering-capability-orchestrator";

export interface CodingCapabilityRequirement {
  language: EngineeringLanguage;
  operations: ToolchainOperation[];
  probes: ToolchainProbe[];
}

export interface CodingCapabilityGateResult {
  ready: boolean;
  language: EngineeringLanguage;
  toolchain?: EngineeringToolchain;
  missingOperations: ToolchainOperation[];
  missingExecutables: string[];
  reason: string;
}

/**
 * Mission-facing preflight for local coding execution.
 *
 * This authority answers one question only: can the current runtime
 * safely perform the requested engineering operations? It does not
 * grant filesystem, shell, network, or research authority.
 */
export class CodingCapabilityGate {
  constructor(
    private readonly orchestrator: EngineeringCapabilityOrchestrator,
  ) {}

  async check(
    requirement: CodingCapabilityRequirement,
  ): Promise<CodingCapabilityGateResult> {
    const result = await this.orchestrator.resolve(requirement);

    if (!result.available) {
      return {
        ready: false,
        language: requirement.language,
        missingOperations: result.unsupportedOperations,
        missingExecutables: result.missingExecutables,
        reason: result.reason,
      };
    }

    return {
      ready: true,
      language: requirement.language,
      missingOperations: [],
      missingExecutables: [],
      reason: result.reason,
    };
  }
}
