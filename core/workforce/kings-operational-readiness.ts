import type { ID } from "./types";
import type { EngineeringToolchain } from "./engineering-toolchain";

export interface KingsOperationalReadinessInput {
  machineBuildPassing: boolean;
  ownerApiAvailable: boolean;
  ollamaAvailable: boolean;
  engineeringToolchains: EngineeringToolchain[];
  workforceExecutionAvailable: boolean;
  researchGatewayAvailable: boolean;
  missionContinuityAvailable: boolean;
}

export interface KingsOperationalReadinessResult {
  ready: boolean;
  blockers: string[];
  verifiedCapabilities: string[];
  checkedAt: string;
}

/**
 * Lightweight release gate for the K.I.N.G.S. builder itself.
 * This is intentionally dependency-free: it reports readiness from already
 * verified runtime facts rather than installing or probing new software.
 */
export class KingsOperationalReadinessAuthority {
  evaluate(input: KingsOperationalReadinessInput): KingsOperationalReadinessResult {
    const blockers: string[] = [];
    const verifiedCapabilities: string[] = [];

    if (input.machineBuildPassing) {
      verifiedCapabilities.push("owner-runtime-build");
    } else {
      blockers.push("owner runtime build is not passing");
    }

    if (input.ownerApiAvailable) {
      verifiedCapabilities.push("owner-api");
    } else {
      blockers.push("owner API is unavailable");
    }

    if (input.ollamaAvailable) {
      verifiedCapabilities.push("local-model-runtime");
    } else {
      blockers.push("Ollama/local model runtime is unavailable");
    }

    if (input.engineeringToolchains.length > 0) {
      verifiedCapabilities.push(
        ...input.engineeringToolchains
          .filter((toolchain) => toolchain.enabled)
          .map((toolchain) => `toolchain:${toolchain.language}`),
      );
    } else {
      blockers.push("no engineering toolchains are registered");
    }

    if (input.workforceExecutionAvailable) {
      verifiedCapabilities.push("internal-workforce-execution");
    } else {
      blockers.push("internal workforce execution is unavailable");
    }

    if (input.researchGatewayAvailable) {
      verifiedCapabilities.push("governed-external-research");
    } else {
      blockers.push("governed research gateway is unavailable");
    }

    if (input.missionContinuityAvailable) {
      verifiedCapabilities.push("mission-continuity");
    } else {
      blockers.push("mission continuity is unavailable");
    }

    return {
      ready: blockers.length === 0,
      blockers,
      verifiedCapabilities: [...new Set(verifiedCapabilities)],
      checkedAt: new Date().toISOString(),
    };
  }
}

export function readinessId(): ID {
  return "kings-operational-readiness";
}
