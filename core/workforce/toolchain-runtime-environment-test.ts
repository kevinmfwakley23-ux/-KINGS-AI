import {
  createDefaultEngineeringToolchains,
  EngineeringToolchainRegistry,
} from "./engineering-toolchain";

import {
  ToolchainRuntimeEnvironmentAuthority,
} from "./toolchain-runtime-environment";

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

async function main(): Promise<void> {
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

  const javascript =
    registry.get(
      "javascript",
    );

  if (
    !javascript
  ) {
    throw new Error(
      "JavaScript toolchain must exist",
    );
  }

  const environment =
    await new ToolchainRuntimeEnvironmentAuthority()
      .resolve(
        javascript,
      );

  assert(
    environment.commands.node !==
      undefined,
    "Node executable must resolve",
  );

  assert(
    environment.commands.node.resolved.endsWith(
      "/bin/node",
    ),
    "Node must resolve to an executable path",
  );

  console.log(
    "K.I.N.G.S. TOOLCHAIN RUNTIME ENVIRONMENT: SUCCESS",
  );

  console.log(
    `NODE: ${environment.commands.node.resolved}`,
  );
}

main().catch(
  (error) => {
    console.error(
      "K.I.N.G.S. TOOLCHAIN RUNTIME ENVIRONMENT: FAILURE",
    );
    console.error(error);
    process.exitCode =
      1;
  },
);
