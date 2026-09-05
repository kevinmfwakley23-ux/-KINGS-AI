import {
  EngineeringToolchainRegistry,
  createDefaultEngineeringToolchains,
} from "./engineering-toolchain";

import {
  LocalToolchainProbeAuthority,
} from "./local-toolchain-probe";

import {
  ToolchainVerificationAuthority,
} from "./toolchain-verification";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function main(): void {
  const registry = new EngineeringToolchainRegistry();
  for (const toolchain of createDefaultEngineeringToolchains()) {
    registry.register(toolchain);
  }

  const probeAuthority = new LocalToolchainProbeAuthority(registry);
  const verificationAuthority = new ToolchainVerificationAuthority(registry);

  const probes = probeAuthority.probe({
    language: "typescript",
    requiredOperations: [
      "typecheck",
      "test",
    ],
    workingDirectory: process.cwd(),
  });

  const npx = probes.find((probe) => probe.executable === "npx");
  const npm = probes.find((probe) => probe.executable === "npm");

  assert(
    npx?.available === true &&
      npx.capabilities?.includes("npx-package:tsc") === true,
    "The current K.I.N.G.S. repository must prove its installed TypeScript compiler rather than only proving npx exists.",
  );

  assert(
    npm?.available === true &&
      npm.capabilities?.includes("npm-script:test") === true,
    "The current K.I.N.G.S. repository must prove its required npm test script exists.",
  );

  const verification = verificationAuthority.verify({
    language: "typescript",
    requiredOperations: [
      "typecheck",
      "test",
    ],
    probes,
  });

  assert(
    verification.verified,
    "The actual installed TypeScript toolchain for the K.I.N.G.S. repository must verify end to end.",
  );

  assert(
    verification.missingExecutables.length === 0 &&
      (verification.missingCapabilities ?? []).length === 0,
    "A verified local TypeScript toolchain must have no hidden executable, package, or project-script gaps.",
  );

  console.log("08.RUNTIME actual executable probing: SUCCESS");
  console.log("08.RUNTIME actual npx package probing: SUCCESS");
  console.log("08.RUNTIME actual npm project-script verification: SUCCESS");
  console.log("TREE-08 LOCAL TOOLCHAIN PROBE: SUCCESS");
}

main();
