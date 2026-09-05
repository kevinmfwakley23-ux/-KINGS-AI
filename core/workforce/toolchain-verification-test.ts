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
          capabilities: [
            "npx-package:tsc",
          ],
        },
        {
          executable:
            "npm",
          available:
            true,
          version:
            "verified",
          capabilities: [
            "npm-script:test",
          ],
        },
      ],
    });

  assert(
    verified.verified,
    "Available TypeScript toolchain and required project capabilities must be verified.",
  );

  assert(
    verified.missingExecutables.length ===
      0 &&
    (verified.missingCapabilities ?? []).length ===
      0,
    "Verified TypeScript toolchain must have no missing executable or package/script capabilities.",
  );

  console.log(
    "08.7 available toolchain verification: SUCCESS",
  );

  const missingPythonModule =
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
    !missingPythonModule.verified,
    "Python test capability must fail when pytest is unavailable.",
  );

  assert(
    missingPythonModule.missingExecutables.length ===
      0,
    "The available Python runtime must not be falsely reported missing.",
  );

  assert(
    (missingPythonModule.missingCapabilities ?? []).includes(
      "python-module:pytest",
    ),
    "Missing pytest must be reported as a module capability gap rather than a missing Python executable.",
  );

  console.log(
    "08.7 unavailable Python module rejection: SUCCESS",
  );

  const missingNpxPackage =
    authority.verify({
      language:
        "typescript",
      requiredOperations: [
        "typecheck",
      ],
      probes: [
        {
          executable:
            "npx",
          available:
            true,
          version:
            "verified",
          capabilities: [],
        },
      ],
    });

  assert(
    !missingNpxPackage.verified &&
      (missingNpxPackage.missingCapabilities ?? []).includes(
        "npx-package:tsc",
      ),
    "npx availability alone must never masquerade as TypeScript compiler availability.",
  );

  console.log(
    "08.7 npx package false-positive protection: SUCCESS",
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
