import type {
  EngineeringLanguage,
  EngineeringToolchain,
} from "./engineering-toolchain";

import {
  EngineeringToolchainRegistry,
} from "./engineering-toolchain";

import {
  EngineeringCapabilityOrchestrator,
} from "./engineering-capability-orchestrator";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function toolchain(
  language: EngineeringLanguage,
  id: string,
  executable: string,
): EngineeringToolchain {
  return {
    id,
    language,
    commands: [
      {
        operation: "typecheck",
        executable,
        args: [],
      },
      {
        operation: "test",
        executable,
        args: [],
      },
    ],
  };
}

async function main(): Promise<void> {
  const registry = new EngineeringToolchainRegistry();
  let discoveredCount = 0;

  const discovery = {
    async discover(language: EngineeringLanguage) {
      discoveredCount += 1;
      if (language !== "typescript") return undefined;
      return toolchain("typescript", "typescript-test", "/usr/bin/node");
    },
  };

  const orchestrator = new EngineeringCapabilityOrchestrator(
    registry,
    discovery,
  );

  const first = await orchestrator.resolve({
    language: "typescript",
    operations: ["typecheck", "test"],
  });

  assert(first.available, "discovered and verified toolchain should be available");
  assert(discoveredCount === 1, "missing capability should invoke discovery once");
  assert(registry.get("typescript")?.id === "typescript-test", "verified toolchain should be registered");

  const second = await orchestrator.resolve({
    language: "typescript",
    operations: ["typecheck"],
  });

  assert(second.available, "existing registered toolchain should satisfy repeat resolution");
  assert(discoveredCount === 1, "existing verified capability should not rediscover unnecessarily");

  const third = await orchestrator.resolve({
    language: "python",
    operations: ["build"],
  });

  assert(!third.available, "unsupported discovered language must remain unavailable");
  assert(discoveredCount === 2, "new language should be checked through the discovery boundary");

  console.log("ENGINEERING CAPABILITY ORCHESTRATOR: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
