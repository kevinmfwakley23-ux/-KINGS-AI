import {
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  EngineeringRepairRetestBridge,
} from "./engineering-repair-retest-bridge";

import type {
  EngineeringRepairPlan,
} from "./engineering-repair-planner";

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
  const root =
    await mkdtemp(
      "/tmp/kings-tree-0836-",
    );

  const target =
    join(
      root,
      "repair-target.js",
    );

  await writeFile(
    target,
    "process.exit(7);\n",
    "utf8",
  );

  const fixedContent =
    "process.stdout.write('KINGS_REPAIR_RETEST_OK');\n";

  const plan:
    EngineeringRepairPlan =
    {
      id:
        "repair-plan-tree-0836",
      projectId:
        "project-tree-0836",
      failureAnalysisId:
        "analysis-tree-0836",
      authorized:
        true,
      steps: [
        {
          id:
            "repair-step-tree-0836-inspect",
          strategy:
            "inspect",
          description:
            "Inspect the real failure.",
          reason:
            "Repair begins from evidence.",
          required:
            true,
        },
        {
          id:
            "repair-step-tree-0836-edit",
          strategy:
            "edit",
          description:
            "Apply the verified repair.",
          reason:
            "The failure has been diagnosed.",
          required:
            true,
        },
        {
          id:
            "repair-step-tree-0836-retest",
          strategy:
            "retest",
          description:
            "Run the real verification again.",
          reason:
            "Repair requires successful verification.",
          required:
            true,
        },
      ],
      stopAfterFailure:
        true,
    };

  const bridge =
    new EngineeringRepairRetestBridge();

  const result =
    await bridge.execute({
      plan,
      failureDiagnostics:
        "process exited with code 7",
      edit: {
        stepId:
          "repair-step-tree-0836-edit",
        projectId:
          "project-tree-0836",
        path:
          target,
        content:
          fixedContent,
      },
      retestCommand: {
        id:
          "command-tree-0836-retest",
        projectId:
          "project-tree-0836",
        executionStepId:
          "step-tree-0836-retest",
        language:
          "javascript",
        operation:
          "run",
        executable:
          process.execPath,
        args: [
          target,
        ],
        workingDirectory:
          root,
        authorized:
          true,
      },
      filePolicy: {
        allowedReadPaths: [
          root,
        ],
        allowedWritePaths: [
          root,
        ],
        maxFileBytes:
          16_384,
      },
      sandboxPolicy: {
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
      },
      completedAt:
        new Date().toISOString(),
    });

  assert(
    result.status ===
      "completed",
    "Successful repair/retest sequence must complete.",
  );

  assert(
    result.verified,
    "Successful real retest must verify the repair.",
  );

  assert(
    result.stepResults.length ===
      3,
    "Inspect, edit, and retest must all produce durable results.",
  );

  assert(
    result.stepResults[0].strategy ===
      "inspect",
    "First repair step must inspect.",
  );

  assert(
    result.stepResults[1].strategy ===
      "edit",
    "Second repair step must edit.",
  );

  assert(
    result.stepResults[2].strategy ===
      "retest",
    "Third repair step must retest.",
  );

  assert(
    result.stepResults.every(
      (
        step,
      ) =>
        step.status ===
        "success",
    ),
    "Every repair step must succeed.",
  );

  const repaired =
    await readFile(
      target,
      "utf8",
    );

  assert(
    repaired ===
      fixedContent,
    "The real repair must modify the project before retest.",
  );

  assert(
    result.stepResults[2].output.includes(
      "KINGS_REPAIR_RETEST_OK",
    ),
    "Retest output must come from the real repaired process.",
  );

  console.log(
    "08.36 REAL REPAIR EXECUTION: SUCCESS",
  );

  console.log(
    "08.36 REAL FILE CHANGE TO RETEST: SUCCESS",
  );

  console.log(
    "08.36 REAL RETEST EXECUTION: SUCCESS",
  );

  console.log(
    "08.36 VERIFIED REPAIR: SUCCESS",
  );

  console.log(
    "TREE-08.36 REAL REPAIR RETEST BRIDGE: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
