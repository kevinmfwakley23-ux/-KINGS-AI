import type {
  EngineeringLanguage,
  ToolchainOperation,
  EngineeringToolchain,
} from "./engineering-toolchain";

import {
  EngineeringCapabilityOrchestrator,
  type ToolchainProbeProvider,
} from "./engineering-capability-orchestrator";

export interface CodingCapabilityRequirement {
  language: EngineeringLanguage;
  operations: ToolchainOperation[];
  probes: ToolchainProbeProvider;
}

export interface CodingCapabilityGateResult {
  ready: boolean;
  language: EngineeringLanguage;
  toolchain?: EngineeringToolchain;
  missingOperations: ToolchainOperation[];
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
    const result = await this.orchestrator.resolve({
      language: requirement.language,
      operations: requirement.operations,
      probes: requirement.probes,
    });

    if (!result.available) {
      return {
        ready: false,
        language: requirement.language,
        missingOperations: requirement.operations,
        reason: result.reason,
      };
    }

    return {
      ready: true,
      language: requirement.language,
      missingOperations: [],
      reason: result.reason,
    };
  }
}
