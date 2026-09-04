import type {
  EngineeringToolchain,
  EngineeringLanguage,
} from "./engineering-toolchain";

import {
  EngineeringCapabilityOrchestrator,
} from "./engineering-capability-orchestrator";

import {
  EngineeringToolchainRegistry,
} from "./engineering-toolchain";

import {
  CodingCapabilityGate,
} from "./coding-capability-gate";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function toolchain(
  language: EngineeringLanguage,
  command: string,
): EngineeringToolchain {
  return {
    id: `test-${language}`,
    language,
    displayName: `${language} test toolchain`,
    fileExtensions: [".ts"],
    commands: [
      {
        operation: "test",
        command,
        args: [],
        requiresCompilation: false,
      },
    ],
    enabled: true,
  };
}

async function main(): Promise<void> {
  const registry = new EngineeringToolchainRegistry();
  registry.register(toolchain("typescript", "/definitely/missing/kings-tool"));

  const orchestrator = new EngineeringCapabilityOrchestrator(
    registry,
    {
      async discover(language) {
        return registry.get(language);
      },
    },
  );

  const gate = new CodingCapabilityGate(orchestrator);

  const blocked = await gate.check({
    language: "typescript",
    operations: ["test"],
    probes: [
      {
        executable: "/definitely/missing/kings-tool",
        available: false,
      },
    ],
  });

  assert(!blocked.ready, "an unavailable executable must block coding capability");
  assert(
    blocked.missingExecutables.includes("/definitely/missing/kings-tool"),
    "the blocked result must preserve the missing executable diagnostic",
  );

  console.log("CODING CAPABILITY GATE: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
