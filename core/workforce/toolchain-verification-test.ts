import {
  EngineeringToolchainRegistry,
  createDefaultEngineeringToolchains,
} from "./engineering-toolchain";

import {
  ToolchainVerificationAuthority,
} from "./toolchain-verification";

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

  for (
    const toolchain of
      createDefaultEngineeringToolchains()
  ) {
    registry.register(
      toolchain,
    );
  }

  const authority =
    new ToolchainVerificationAuthority(
      registry,
    );

  const verified =
    authority.verify({
      language:
        "typescript",
      requiredOperations: [
        "typecheck",
        "test",
      ],
      probes: [
        {
          executable:
            "npx",
          available:
            true,
          version:
            "verified",
        },
        {
          executable:
            "npm",
          available:
            true,
          version:
            "verified",
        },
      ],
    });

  assert(
    verified.verified,
    "Available TypeScript toolchain must be verified.",
  );

  assert(
    verified.missingExecutables.length ===
      0,
    "Verified TypeScript toolchain must have no missing executables.",
  );

  console.log(
    "08.7 available toolchain verification: SUCCESS",
  );

  const missing =
    authority.verify({
      language:
        "python",
      requiredOperations: [
        "run",
        "test",
      ],
      probes: [
        {
          executable:
            "python3",
          available:
            true,
          version:
            "verified",
          capabilities: [],
        },
      ],
    });

  assert(
    !missing.verified,
    "Python test capability must fail when pytest is unavailable.",
  );

  assert(
    missing.missingExecutables.includes(
      "python3",
    ) === false,
    "Python runtime itself must remain recognized as available.",
  );

  assert(
    missing.missingExecutables.includes(
      "python3",
    ) === false,
    "The available Python runtime must not be falsely reported missing.",
  );

  console.log(
    "08.7 unavailable toolchain rejection: SUCCESS",
  );

  const rust =
    authority.verify({
      language:
        "rust",
      requiredOperations: [
        "build",
        "test",
      ],
      probes: [
        {
          executable:
            "cargo",
          available:
            true,
          version:
            "verified",
        },
      ],
    });

  assert(
    rust.verified,
    "Rust cargo build/test toolchain must verify when cargo is available.",
  );

  console.log(
    "08.7 compiled-language toolchain verification: SUCCESS",
  );

  console.log(
    "TREE-08.7 RUNTIME TOOLCHAIN VERIFICATION: SUCCESS",
  );
}

main();
