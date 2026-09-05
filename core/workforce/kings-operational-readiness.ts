import type { ID } from "./types";
import type { EngineeringToolchain } from "./engineering-toolchain";

export interface KingsOperationalReadinessInput {
  machineBuildPassing: boolean;
  ownerApiAvailable: boolean;
  appRouterAvailable: boolean;
  highCapabilityAiRouteAvailable: boolean;
  verifiedProviderCount: number;
  optionalLocalModelAvailable?: boolean;
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
 * Release gate for the K.I.N.G.S. builder itself.
 *
 * Readiness is based on verified runtime facts. A weak or optional local model
 * is never sufficient evidence that K.I.N.G.S. can perform production work.
 * The system must have an operational app router plus at least one verified
 * high-capability AI route suitable for real reasoning/coding missions.
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

    if (input.appRouterAvailable) {
      verifiedCapabilities.push("shared-app-ai-router");
    } else {
      blockers.push("shared app AI router is unavailable");
    }

    if (input.verifiedProviderCount > 0) {
      verifiedCapabilities.push(`verified-ai-providers:${input.verifiedProviderCount}`);
    } else {
      blockers.push("no verified AI provider is available");
    }

    if (input.highCapabilityAiRouteAvailable) {
      verifiedCapabilities.push("high-capability-ai-route");
    } else {
      blockers.push("no verified high-capability AI route is available for real coding/reasoning work");
    }

    if (input.optionalLocalModelAvailable) {
      verifiedCapabilities.push("optional-local-model-runtime");
    }

    const enabledToolchains = input.engineeringToolchains
      .filter((toolchain) => toolchain.enabled);
    if (enabledToolchains.length > 0) {
      verifiedCapabilities.push(
        ...enabledToolchains.map((toolchain) => `toolchain:${toolchain.language}`),
      );
    } else {
      blockers.push("no enabled engineering toolchains are registered");
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
