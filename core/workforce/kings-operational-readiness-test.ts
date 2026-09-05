import { KingsOperationalReadinessAuthority } from "./kings-operational-readiness";
import { createDefaultEngineeringToolchains } from "./engineering-toolchain";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function main(): void {
  const authority = new KingsOperationalReadinessAuthority();
  const ready = authority.evaluate({
    machineBuildPassing: true,
    ownerApiAvailable: true,
    appRouterAvailable: true,
    highCapabilityAiRouteAvailable: true,
    verifiedProviderCount: 2,
    optionalLocalModelAvailable: false,
    engineeringToolchains: createDefaultEngineeringToolchains(),
    workforceExecutionAvailable: true,
    researchGatewayAvailable: true,
    missionContinuityAvailable: true,
  });

  assert(ready.ready, `K.I.N.G.S. should be operational when all verified dependencies are available: ${ready.blockers.join(" | ")}`);
  assert(ready.verifiedCapabilities.includes("shared-app-ai-router"), "shared app router should be reported");
  assert(ready.verifiedCapabilities.includes("high-capability-ai-route"), "high-capability AI route should be reported");
  assert(!ready.verifiedCapabilities.includes("optional-local-model-runtime"), "optional local model should not be required for readiness");
  assert(ready.verifiedCapabilities.includes("internal-workforce-execution"), "internal workforce execution should be reported");
  assert(ready.verifiedCapabilities.includes("governed-external-research"), "research should be reported");

  const weakLocalOnly = authority.evaluate({
    machineBuildPassing: true,
    ownerApiAvailable: true,
    appRouterAvailable: true,
    highCapabilityAiRouteAvailable: false,
    verifiedProviderCount: 0,
    optionalLocalModelAvailable: true,
    engineeringToolchains: createDefaultEngineeringToolchains(),
    workforceExecutionAvailable: true,
    researchGatewayAvailable: true,
    missionContinuityAvailable: true,
  });

  assert(!weakLocalOnly.ready, "a local model alone must not make K.I.N.G.S. production-ready");
  assert(weakLocalOnly.blockers.some((blocker) => blocker.includes("high-capability")), "missing capable AI route should be a concrete blocker");

  const blocked = authority.evaluate({
    machineBuildPassing: false,
    ownerApiAvailable: true,
    appRouterAvailable: false,
    highCapabilityAiRouteAvailable: false,
    verifiedProviderCount: 0,
    engineeringToolchains: [],
    workforceExecutionAvailable: true,
    researchGatewayAvailable: true,
    missionContinuityAvailable: true,
  });

  assert(!blocked.ready, "K.I.N.G.S. should not report ready with missing runtime dependencies");
  assert(blocked.blockers.length >= 5, "readiness should preserve concrete blockers");

  console.log("KINGS OPERATIONAL READINESS: SUCCESS");
}

main();
