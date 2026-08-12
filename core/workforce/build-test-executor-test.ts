import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  BuildTestExecutor,
} from "./build-test-executor";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

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

function contract(
  allowedPath:
    string,
): WorkUnitContract {
  const now =
    new Date().toISOString();

  return {
    id:
      "WORK-UNIT-tree-065",
    role:
      "Build and test worker",
    objective:
      "Run the authorized build and test steps.",
    capabilityIds: [
      "coding",
    ],
    allowedToolIds: [
      "tool-execution-sandbox",
    ],
    allowedPaths: [
      allowedPath,
    ],
    budget: {
      maxTimeMs:
        60_000,
      maxTokens:
        10_000,
      maxIterations:
        3,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "Build and test steps pass.",
    ],
    requiredEvidenceTypes: [
      "test",
    ],
    approved:
      true,
    createdAt:
      now,
    updatedAt:
      now,
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
      "/tmp/kings-tree-065-",
    );

  try {
    await writeFile(
      join(
        root,
        "success.js",
      ),
      "process.stdout.write('BUILD_OK');\n",
      "utf8",
    );

    await writeFile(
      join(
        root,
        "failure.js",
      ),
      "process.stderr.write('BUILD_FAIL'); process.exit(2);\n",
      "utf8",
    );

    const executor =
      new BuildTestExecutor({
        sandboxPolicy:
          policy(root),
      });

    const successful =
      await executor.execute({
        taskId:
          "task-tree-065",
        workUnit:
          contract(root),
        steps: [
          {
            id:
              "build",
            operation:
              "build",
            command:
              process.execPath,
            args: [
              join(
                root,
                "success.js",
              ),
            ],
            workingDirectory:
              root,
          },
          {
            id:
              "test",
            operation:
              "test",
            command:
              process.execPath,
            args: [
              join(
                root,
                "success.js",
              ),
            ],
            workingDirectory:
              root,
          },
        ],
      });

    assert(
      successful.passed,
      "All passing build/test steps must produce a passing result.",
    );

    assert(
      successful.steps.length ===
        2,
      "All build/test steps must be recorded.",
    );

    assert(
      successful.steps.every(
        (step) =>
          step.execution.exitCode ===
            0 &&
          step.passed,
      ),
      "Each successful step must preserve successful execution evidence.",
    );

    const failed =
      await executor.execute({
        taskId:
          "task-tree-065",
        workUnit:
          contract(root),
        steps: [
          {
            id:
              "build",
            operation:
              "build",
            command:
              process.execPath,
            args: [
              join(
                root,
                "failure.js",
              ),
            ],
            workingDirectory:
              root,
          },
          {
            id:
              "test",
            operation:
              "test",
            command:
              process.execPath,
            args: [
              join(
                root,
                "success.js",
              ),
            ],
            workingDirectory:
              root,
          },
        ],
      });

    assert(
      !failed.passed,
      "A failed build/test step must fail the execution result.",
    );

    assert(
      failed.steps.length ===
        1,
      "Execution must stop after the first failed build/test step.",
    );

    let rejected =
      false;

    try {
      await executor.execute({
        taskId:
          "task-tree-065",
        workUnit:
          contract(
            root,
          ),
        steps: [
          {
            id:
              "build",
            operation:
              "build",
            command:
              process.execPath,
            args: [
              join(
                root,
                "success.js",
              ),
            ],
            workingDirectory:
              join(
                root,
                "..",
              ),
          },
        ],
      });
    } catch {
      rejected =
        true;
    }

    assert(
      rejected,
      "Unauthorized working directories must be rejected.",
    );

    let unapproved =
      false;

    try {
      await executor.execute({
        taskId:
          "task-tree-065",
        workUnit: {
          ...contract(
            root,
          ),
          approved:
            false,
        },
        steps: [
          {
            id:
              "build",
            operation:
              "build",
            command:
              process.execPath,
            args: [
              join(
                root,
                "success.js",
              ),
            ],
            workingDirectory:
              root,
          },
        ],
      });
    } catch {
      unapproved =
        true;
    }

    assert(
      unapproved,
      "Unapproved Work Units must not execute build/test steps.",
    );

    console.log(
      "06.5 governed build execution: SUCCESS",
    );

    console.log(
      "06.5 governed test execution: SUCCESS",
    );

    console.log(
      "06.5 failure preservation and early stop: SUCCESS",
    );

    console.log(
      "06.5 Work Unit path enforcement: SUCCESS",
    );

    console.log(
      "06.5 approval enforcement: SUCCESS",
    );

    console.log(
      "TREE-06.5 BUILD / TEST EXECUTION: SUCCESS",
    );
  } finally {
    await rm(
      root,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }
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
