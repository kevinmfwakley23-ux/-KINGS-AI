import {
  EngineeringCommandBuilder,
} from "./engineering-command-builder";

import type {
  EngineeringCommand,
} from "./engineering-workspace";

import type {
  EngineeringToolchain,
} from "./engineering-toolchain";

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
  const builder =
    new EngineeringCommandBuilder();

  const toolchain:
    EngineeringToolchain =
    {
      id:
        "toolchain-typescript",
      language:
        "typescript",
      displayName:
        "TypeScript",
      fileExtensions: [
        ".ts",
        ".tsx",
      ],
      commands: [
        {
          operation:
            "build",
          command:
            "npx",
          args: [
            "tsc",
            "--noEmit",
          ],
          requiresCompilation:
            true,
        },
        {
          operation:
            "test",
          command:
            "npm",
          args: [
            "test",
          ],
          requiresCompilation:
            false,
        },
        {
          operation:
            "run",
          command:
            "node",
          args: [
            "dist/index.js",
          ],
          requiresCompilation:
            false,
        },
      ],
      enabled:
        true,
    };

  const command:
    EngineeringCommand =
    {
      id:
        "command-tree-0812",
      executionStepId:
        "step-tree-0812",
      projectId:
        "project-tree-0812",
      language:
        "typescript",
      operation:
        "build",
      workingDirectory:
        "/projects/tree-0812",
      allowed:
        true,
    };

  const built =
    builder.build({
      command,
      toolchain,
    });

  assert(
    built.authorized,
    "Authorized engineering command must be buildable.",
  );

  assert(
    built.executable ===
      "npx",
    "Command builder must select the verified toolchain executable.",
  );

  assert(
    built.args.join(" ") ===
      "tsc --noEmit",
    "Command builder must preserve the verified toolchain arguments.",
  );

  assert(
    built.workingDirectory ===
      "/projects/tree-0812",
    "Command builder must preserve the governed project workspace.",
  );

  console.log(
    "08.12 verified command construction: SUCCESS",
  );

  const missingOperation =
    builder.build({
      command: {
        ...command,
        operation:
          "test",
      },
      toolchain: {
        ...toolchain,
        commands: toolchain.commands.filter(
          (candidate) =>
            candidate.operation !==
            "test",
        ),
      },
    });

  assert(
    !missingOperation.authorized,
    "Missing verified command definitions must be rejected.",
  );

  console.log(
    "08.12 missing command definition rejection: SUCCESS",
  );

  const unauthorized =
    builder.build({
      command: {
        ...command,
        allowed:
          false,
        reason:
          "Workspace authorization denied.",
      },
      toolchain,
    });

  assert(
    !unauthorized.authorized,
    "Unauthorized workspace commands must never become executable commands.",
  );

  console.log(
    "08.12 authorization boundary enforcement: SUCCESS",
  );

  console.log(
    "TREE-08.12 GOVERNED COMMAND BUILDER: SUCCESS",
  );
}

main();
