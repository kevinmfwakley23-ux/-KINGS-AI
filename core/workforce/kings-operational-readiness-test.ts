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
    ollamaAvailable: true,
    engineeringToolchains: createDefaultEngineeringToolchains(),
    workforceExecutionAvailable: true,
    researchGatewayAvailable: true,
    missionContinuityAvailable: true,
  });

  assert(ready.ready, `K.I.N.G.S. should be operational when all verified dependencies are available: ${ready.blockers.join(" | ")}`);
  assert(ready.verifiedCapabilities.includes("internal-workforce-execution"), "internal workforce execution should be reported");
  assert(ready.verifiedCapabilities.includes("governed-external-research"), "research should be reported");

  const blocked = authority.evaluate({
    machineBuildPassing: false,
    ownerApiAvailable: true,
    ollamaAvailable: false,
    engineeringToolchains: [],
    workforceExecutionAvailable: true,
    researchGatewayAvailable: true,
    missionContinuityAvailable: true,
  });

  assert(!blocked.ready, "K.I.N.G.S. should not report ready with missing runtime dependencies");
  assert(blocked.blockers.length >= 3, "readiness should preserve concrete blockers");

  console.log("KINGS OPERATIONAL READINESS: SUCCESS");
}

main();
