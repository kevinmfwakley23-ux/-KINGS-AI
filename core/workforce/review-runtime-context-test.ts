import {
  OwnerIdentityAuthority,
} from "./owner-identity";

import {
  RuntimeSessionRegistry,
} from "./runtime-session";

import {
  ReviewRuntimeContextAuthority,
} from "./review-runtime-context";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const ownerAuthority =
    new OwnerIdentityAuthority({
      ownerEmail:
        "owner@example.invalid",
      githubLogin:
        "kevinmfwakley23-ux",
      displayName:
        "K.I.N.G.S. Owner",
    });

  const owner =
    ownerAuthority.getOwner();

  const sessions =
    new RuntimeSessionRegistry();

  const now =
    new Date().toISOString();

  sessions.register({
    id:
      "terminal-chromeos-tree-075",
    ownerId:
      owner.id,
    environment: {
      id:
        "env-chromeos-tree-075",
      platform:
        "chromeos",
      hostname:
        "kings-chromebook",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-chromeos-tree-075",
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

  const authority =
    new ReviewRuntimeContextAuthority(
      ownerAuthority,
      sessions,
    );

  const context =
    authority.resolve({
      ownerLogin:
        "owner@example.invalid",
      sessionId:
        "terminal-chromeos-tree-075",
    });

  assert(
    context.owner.email ===
      "owner@example.invalid",
    "Authenticated owner email must be preserved in review context.",
  );

  assert(
    context.runtime.environment.platform ===
      "chromeos",
    "Review context must preserve the active terminal platform.",
  );

  let wrongOwnerRejected =
    false;

  try {
    authority.resolve({
      ownerLogin:
        "different-owner",
      sessionId:
        "terminal-chromeos-tree-075",
    });
  } catch {
    wrongOwnerRejected =
      true;
  }

  assert(
    wrongOwnerRejected,
    "A different owner identity must not resolve the review runtime.",
  );

  sessions.register({
    id:
      "terminal-linux-tree-075",
    ownerId:
      owner.id,
    environment: {
      id:
        "env-linux-tree-075",
      platform:
        "linux",
      hostname:
        "kings-linux",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-linux-tree-075",
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

  const linuxContext =
    authority.resolve({
      ownerLogin:
        "owner@example.invalid",
      sessionId:
        "terminal-linux-tree-075",
    });

  assert(
    linuxContext.runtime.environment.platform ===
      "linux",
    "The same owner must be able to resolve an independent Linux terminal.",
  );

  console.log(
    "07.5 owner-authenticated review context: SUCCESS",
  );

  console.log(
    "07.5 active terminal ownership enforcement: SUCCESS",
  );

  console.log(
    "07.5 ChromeOS runtime resolution: SUCCESS",
  );

  console.log(
    "07.5 Linux runtime resolution: SUCCESS",
  );

  console.log(
    "07.5 owner mismatch rejection: SUCCESS",
  );

  console.log(
    "TREE-07.5 OWNER + RUNTIME REVIEW CONTEXT: SUCCESS",
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
