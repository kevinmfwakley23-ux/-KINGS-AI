import {
  RuntimeSessionRegistry,
} from "./runtime-session";

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
    new RuntimeSessionRegistry();

  const now =
    new Date().toISOString();

  registry.register({
    id:
      "terminal-linux-1",
    ownerId:
      "owner-github-kevinmfwakley23-ux",
    environment: {
      id:
        "env-linux-1",
      platform:
        "linux",
      hostname:
        "kings-linux",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-linux-1",
      capabilities: [
        "filesystem",
        "git",
        "typescript",
        "node",
      ],
    },
    createdAt:
      now,
    updatedAt:
      now,
    active:
      true,
  });

  registry.register({
    id:
      "terminal-chromeos-1",
    ownerId:
      "owner-github-kevinmfwakley23-ux",
    environment: {
      id:
        "env-chromeos-1",
      platform:
        "chromeos",
      hostname:
        "kings-chromebook",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-chromeos-1",
      capabilities: [
        "filesystem",
        "git",
        "typescript",
        "node",
      ],
    },
    createdAt:
      now,
    updatedAt:
      now,
    active:
      true,
  });

  assert(
    registry.list().length ===
      2,
    "Multiple terminal environments must be independently registered.",
  );

  assert(
    registry.get(
      "terminal-linux-1",
    )?.environment.platform ===
      "linux",
    "Linux terminal capability must be preserved.",
  );

  assert(
    registry.get(
      "terminal-chromeos-1",
    )?.environment.platform ===
      "chromeos",
    "ChromeOS terminal capability must be preserved.",
  );

  const deactivated =
    registry.deactivate(
      "terminal-linux-1",
    );

  assert(
    !deactivated.active,
    "Individual terminal sessions must be independently deactivatable.",
  );

  assert(
    registry.get(
      "terminal-chromeos-1",
    )?.active ===
      true,
    "Deactivating one terminal must not disable another terminal.",
  );

  console.log(
    "MULTI-TERMINAL Linux session registration: SUCCESS",
  );

  console.log(
    "MULTI-TERMINAL ChromeOS session registration: SUCCESS",
  );

  console.log(
    "MULTI-TERMINAL independent session state: SUCCESS",
  );

  console.log(
    "RUNTIME SESSION REGISTRY: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
