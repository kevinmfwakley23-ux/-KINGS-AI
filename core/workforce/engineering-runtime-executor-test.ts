import {
  mkdtemp,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  EngineeringRuntimeExecutor,
} from "./engineering-runtime-executor";

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
  root:
    string,
  args:
    string[],
):
  BuiltEngineeringCommand {
  return {
    id:
      "command-tree-0832",
    projectId:
      "project-tree-0832",
    executionStepId:
      "step-tree-0832",
    language:
      "javascript",
    operation:
      "run",
    executable:
      process.execPath,
    args,
    workingDirectory:
      root,
    authorized:
      true,
  };
}

function policy(
  root:
    string,
): any {
  return {
    allowedCommands: [
      process.execPath,
    ],
    allowedWorkingDirectories: [
      root,
    ],
    allowedReadPaths: [
      root,
    ],
    allowedWritePaths: [
      root,
    ],
    allowedEnvironmentKeys: [],
    allowedSideEffects: [
      "read",
      "write",
      "execute",
    ],
    timeoutMs:
      10_000,
    maxOutputBytes:
      16_384,
    maxConcurrentProcesses:
      1,
    allowShell:
      false,
    allowNetwork:
      false,
  };
}

async function main(): Promise<void> {
  const root =
    await mkdtemp(
      "/tmp/kings-tree-0832-",
    );

  await writeFile(
    join(
      root,
      "success.js",
    ),
    "process.stdout.write('KINGS_REAL_EXECUTION_OK');\n",
    "utf8",
  );

  await writeFile(
    join(
      root,
      "failure.js",
    ),
    "process.stderr.write('KINGS_REAL_EXECUTION_FAIL'); process.exit(7);\n",
    "utf8",
  );

  const executor =
    new EngineeringRuntimeExecutor({
      sandboxPolicy:
        policy(root),
    });

  const success =
    await executor.execute(
      command(
        root,
        [
          join(
            root,
            "success.js",
          ),
        ],
      ),
    );

  assert(
    success.exitCode ===
      0,
    "Real successful process must return exit code zero.",
  );

  assert(
    success.stdout.includes(
      "KINGS_REAL_EXECUTION_OK",
    ),
    "Real process stdout must be captured.",
  );

  assert(
    success.stderr ===
      "",
    "Successful process must not produce unexpected stderr.",
  );

  console.log(
    "08.32 REAL PROCESS EXECUTION: SUCCESS",
  );

  const failure =
    await executor.execute(
      command(
        root,
        [
          join(
            root,
            "failure.js",
          ),
        ],
      ),
    );

  assert(
    failure.exitCode ===
      7,
    "Real failed process must preserve its exit code.",
  );

  assert(
    failure.stderr.includes(
      "KINGS_REAL_EXECUTION_FAIL",
    ),
    "Real process stderr must be captured.",
  );

  console.log(
    "08.32 REAL FAILURE CAPTURE: SUCCESS",
  );

  let blocked =
    false;

  try {
    await executor.execute({
      ...command(
        root,
        [
          join(
            root,
            "success.js",
          ),
        ],
      ),
      authorized:
        false,
    });
  } catch {
    blocked =
      true;
  }

  assert(
    blocked,
    "Unauthorized engineering commands must never reach the runtime.",
  );

  console.log(
    "08.32 RUNTIME AUTHORIZATION: SUCCESS",
  );

  console.log(
    "TREE-08.32 REAL ENGINEERING EXECUTOR: SUCCESS",
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
