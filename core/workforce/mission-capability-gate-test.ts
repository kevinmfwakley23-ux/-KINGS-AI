import type {
  ProjectEngineeringProfile,
} from "./project-engineering-profile";
import type {
  ToolchainVerificationResult,
} from "./toolchain-verification";
import {
  MissionCapabilityGate,
} from "./mission-capability-gate";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function profile(): ProjectEngineeringProfile {
  return {
    id: "profile-test",
    projectPath: "/tmp/mission-capability-gate-test",
    languages: [
      {
        language: "typescript",
        fileCount: 1,
        extensions: [".ts"],
      },
    ],
    requiredOperations: ["typecheck", "test"],
    verifiedToolchains: [],
    unsupportedLanguages: [],
    buildReady: false,
    testReady: false,
    debugReady: false,
  };
}

function verification(verified: boolean): ToolchainVerificationResult {
  return {
    language: "typescript",
    toolchain: {
      id: "toolchain-typescript-test",
      language: "typescript",
      displayName: "TypeScript test toolchain",
      fileExtensions: [".ts"],
      commands: [
        { operation: "typecheck", command: "npx", args: ["tsc"], requiresCompilation: false },
        { operation: "test", command: "npm", args: ["test"], requiresCompilation: false },
      ],
      enabled: true,
    },
    verified,
    availableExecutables: ["npx", "npm"],
    missingExecutables: verified ? [] : ["npx"],
    unsupportedOperations: [],
  };
}

function main(): void {
  const gate = new MissionCapabilityGate();

  const ready = gate.evaluate(
    "mission-capability-gate-test-ready",
    profile(),
    [verification(true)],
  );

  assert(ready.ready, "verified capability set should allow execution");
  assert(ready.gapPlan.gaps.length === 0, "ready mission should have no capability gaps");

  const blocked = gate.evaluate(
    "mission-capability-gate-test-blocked",
    profile(),
    [verification(false)],
  );

  assert(!blocked.ready, "unverified capability should block execution");
  assert(blocked.gapPlan.gaps.length > 0, "blocked mission should expose capability gaps");
  assert(blocked.reason.includes("unverified engineering capability gap"), "blocked reason should be actionable");

  console.log("MISSION CAPABILITY GATE: SUCCESS");
}

main();
