import {
  EngineeringToolchainRegistry,
  type EngineeringToolchain,
} from "./engineering-toolchain";

import {
  DynamicToolchainRegistrationAuthority,
} from "./dynamic-toolchain-registration";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function main(): void {
  const registry = new EngineeringToolchainRegistry();
  const authority = new DynamicToolchainRegistrationAuthority(registry);

  const toolchain: EngineeringToolchain = {
    id: "toolchain-kotlin-runtime",
    language: "kotlin",
    displayName: "Kotlin JVM Toolchain",
    fileExtensions: [".kt", ".kts"],
    commands: [
      {
        operation: "build",
        command: "gradle",
        args: ["build"],
        requiresCompilation: true,
      },
      {
        operation: "test",
        command: "gradle",
        args: ["test"],
        requiresCompilation: true,
      },
      {
        operation: "run",
        command: "gradle",
        args: ["run"],
        requiresCompilation: true,
      },
    ],
    enabled: true,
  };

  const verification = {
    language: "kotlin",
    toolchain,
    verified: true,
    availableExecutables: ["gradle"],
    missingExecutables: [],
    unsupportedOperations: [],
  };

  const result = authority.register({
    toolchain,
    verification,
    requiredOperations: ["build", "test", "run"],
  });

  assert(
    result.registered,
    "Verified dynamic toolchain must register.",
  );

  assert(
    registry.get("kotlin")?.displayName === "Kotlin JVM Toolchain",
    "A genuinely new language id must be available through the existing toolchain registry without a core type change.",
  );

  const discovered = registry.discover({
    language: "kotlin",
    requiredOperations: ["build", "test", "run"],
  });
  assert(
    discovered.supported && discovered.missingOperations.length === 0,
    "Dynamically registered language toolchain must participate in ordinary discovery.",
  );

  console.log(
    "08.DYNAMIC out-of-tree language registration: SUCCESS",
  );

  let rejected = false;
  try {
    authority.register({
      toolchain: {
        ...toolchain,
        id: "unverified-toolchain",
        language: "zig",
      },
      verification: {
        ...verification,
        language: "zig",
        toolchain: {
          ...toolchain,
          id: "unverified-toolchain",
          language: "zig",
        },
        verified: false,
      },
      requiredOperations: ["build"],
    });
  } catch {
    rejected = true;
  }

  assert(
    rejected,
    "Unverified toolchains must never register.",
  );
  assert(
    registry.get("zig") === undefined,
    "Rejected dynamic language must not enter the runtime registry.",
  );

  console.log(
    "08.DYNAMIC unverified toolchain protection: SUCCESS",
  );
  console.log(
    "TREE-08 DYNAMIC TOOLCHAIN REGISTRATION: SUCCESS",
  );
}

main();
