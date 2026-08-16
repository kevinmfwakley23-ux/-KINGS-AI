import {
  resolveToolchainExecutable,
  verifyToolchainExecutable,
} from "./toolchain-executable-resolution";

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
  const resolved =
    await resolveToolchainExecutable({
      executable:
        "node",
    });

  assert(
    resolved.verified,
    "node should resolve",
  );

  assert(
    resolved.resolved.endsWith(
      "/bin/node",
    ),
    "node should resolve to an executable path",
  );

  const verified =
    await verifyToolchainExecutable({
      executable:
        "node",
    });

  assert(
    verified.verified,
    "resolved node executable should pass version verification",
  );

  console.log(
    "K.I.N.G.S. TOOLCHAIN EXECUTABLE RESOLUTION: SUCCESS",
  );

  console.log(
    `RESOLVED NODE: ${verified.resolved}`,
  );
}

main().catch(
  (error) => {
    console.error(
      "K.I.N.G.S. TOOLCHAIN EXECUTABLE RESOLUTION: FAILURE",
    );
    console.error(error);
    process.exitCode =
      1;
  },
);
