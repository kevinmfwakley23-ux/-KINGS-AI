import {
  EngineeringToolchainRegistry,
  type EngineeringToolchain,
} from "./engineering-toolchain";

import {
  DynamicToolchainRegistrationAuthority,
} from "./dynamic-toolchain-registration";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function main(): void {
  const registry =
    new EngineeringToolchainRegistry();

  const authority =
    new DynamicToolchainRegistrationAuthority(
      registry,
    );

  const toolchain:
    EngineeringToolchain = {
    id:
      "toolchain-kotlin-runtime",
    language:
      "kotlin",
    displayName:
      "Kotlin JVM Toolchain",
    fileExtensions: [
      ".kt",
      ".kts",
    ],
    commands: [
      {
        operation:
          "build",
        command:
          "gradle",
        args: [
          "build",
        ],
        requiresCompilation:
          true,
      },
      {
        operation:
          "test",
        command:
          "gradle",
        args: [
          "test",
        ],
        requiresCompilation:
          true,
      },
      {
        operation:
          "run",
        command:
          "gradle",
        args: [
          "run",
        ],
        requiresCompilation:
          true,
      },
    ],
    enabled:
      true,
  };

  const verification =
    {
      language:
        "kotlin",
      toolchain,
      verified:
        true,
      availableExecutables: [
        "gradle",
      ],
      missingExecutables: [],
      unsupportedOperations: [],
    };

  const result =
    authority.register({
      toolchain,
      verification,
      requiredOperations: [
        "build",
        "test",
        "run",
      ],
    });

  assert(
    result.registered,
    "Verified dynamic toolchain for a non-default language must register.",
  );

  assert(
    result.language ===
      "kotlin",
    "Dynamic registration must preserve the newly learned language identity.",
  );

  assert(
    registry.get(
      "kotlin",
    )?.displayName ===
      "Kotlin JVM Toolchain",
    "Newly verified language toolchain must be retrievable without masquerading as a default language.",
  );

  console.log(
    "08.DYNAMIC non-default language registration: SUCCESS",
  );

  let rejected =
    false;

  try {
    authority.register({
      toolchain: {
        ...toolchain,
        id:
          "unverified-toolchain",
      },
      verification: {
        ...verification,
        verified:
          false,
      },
      requiredOperations: [
        "build",
      ],
    });
  } catch {
    rejected =
      true;
  }

  assert(
    rejected,
    "Unverified toolchains must never register.",
  );

  console.log(
    "08.DYNAMIC unverified toolchain protection: SUCCESS",
  );

  console.log(
    "TREE-08 DYNAMIC TOOLCHAIN REGISTRATION: SUCCESS",
  );
}

main();
