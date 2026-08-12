import {
  EngineeringExecutionLoopAuthority,
} from "./engineering-execution-loop";

import type {
  BuiltEngineeringCommand,
} from "./engineering-command-builder";

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

function command(
  overrides:
    Partial<BuiltEngineeringCommand> = {},
):
  BuiltEngineeringCommand {
  return {
    id:
      "command-tree-0813",
    projectId:
      "project-tree-0813",
    executionStepId:
      "step-tree-0813",
    language:
      "typescript",
    operation:
      "build",
    executable:
      "npx",
    args: [
      "tsc",
      "--noEmit",
    ],
    workingDirectory:
      "/projects/tree-0813",
    authorized:
      true,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const authority =
    new EngineeringExecutionLoopAuthority();

  const initial =
    authority.create(
      "execution-tree-0813",
    );

  const successful =
    await authority.execute(
      initial,
      command(),
      {
        async execute() {
          return {
            exitCode:
              0,
            stdout:
              "TypeScript compilation successful.",
            stderr:
              "",
            durationMs:
              125,
          };
        },
      },
      new Date().toISOString(),
    );

  assert(
    successful.status ===
      "completed",
    "Successful command execution must complete the loop.",
  );

  assert(
    successful.attempts.length ===
      1,
    "Successful execution must record an attempt.",
  );

  assert(
    successful.attempts[0].result?.status ===
      "success",
    "Successful command must produce a successful result.",
  );

  assert(
    successful.attempts[0].result?.exitCode ===
      0,
    "Successful command result must preserve exit code zero.",
  );

  assert(
    successful.successfulCommandIds.includes(
      "command-tree-0813",
    ),
    "Successful command must be recorded as completed.",
  );

  console.log(
    "08.13 authorized command execution: SUCCESS",
  );

  const failed =
    await authority.execute(
      authority.create(
        "execution-tree-0813-failed",
      ),
      command({
        id:
          "command-tree-0813-failed",
      }),
      {
        async execute() {
          return {
            exitCode:
              1,
            stdout:
              "",
            stderr:
              "Compilation failed.",
            durationMs:
              210,
          };
        },
      },
      new Date().toISOString(),
    );

  assert(
    failed.status ===
      "failed",
    "Non-zero command execution must produce failed state.",
  );

  assert(
    failed.failedCommandIds.includes(
      "command-tree-0813-failed",
    ),
    "Failed command must be recorded for recovery/debugging.",
  );

  assert(
    failed.attempts[0].result?.stderr ===
      "Compilation failed.",
    "Execution loop must preserve diagnostic stderr.",
  );

  console.log(
    "08.13 command failure capture: SUCCESS",
  );

  const blocked =
    await authority.execute(
      authority.create(
        "execution-tree-0813-blocked",
      ),
      command({
        id:
          "command-tree-0813-blocked",
        authorized:
          false,
        reason:
          "Workspace authorization denied.",
      }),
      {
        async execute() {
          throw new Error(
            "Executor must never be called for blocked commands.",
          );
        },
      },
      new Date().toISOString(),
    );

  assert(
    blocked.status ===
      "blocked",
    "Unauthorized commands must remain blocked.",
  );

  assert(
    blocked.attempts[0].result?.status ===
      "blocked",
    "Blocked commands must produce an explicit blocked result.",
  );

  console.log(
    "08.13 unauthorized execution prevention: SUCCESS",
  );

  console.log(
    "TREE-08.13 ENGINEERING EXECUTION LOOP: SUCCESS",
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
