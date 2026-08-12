import {
  mkdtemp,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  EngineeringExecutionPipeline,
} from "./engineering-execution-pipeline";

import {
  EngineeringRuntimeExecutor,
} from "./engineering-runtime-executor";

import type {
  BuiltEngineeringCommand,
} from "./engineering-command-builder";

import type {
  AutonomousEngineeringExecution,
} from "./autonomous-engineering-execution";

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
      "/tmp/kings-tree-0833-",
    );

  await writeFile(
    join(
      root,
      "pipeline.js",
    ),
    "process.stdout.write('KINGS_PIPELINE_REAL');\n",
    "utf8",
  );

  const command:
    BuiltEngineeringCommand =
    {
      id:
        "command-tree-0833",
      projectId:
        "project-tree-0833",
      executionStepId:
        "step-tree-0833",
      language:
        "javascript",
      operation:
        "run",
      executable:
        process.execPath,
      args: [
        join(
          root,
          "pipeline.js",
        ),
      ],
      workingDirectory:
        root,
      authorized:
        true,
    };

  const execution:
    AutonomousEngineeringExecution =
    {
      id:
        "execution-tree-0833",
      projectId:
        "project-tree-0833",
      status:
        "ready",
      steps: [
        {
          id:
            "step-tree-0833",
          language:
            "javascript",
          operation:
            "run",
          capabilityId:
            "engineering-javascript",
          sequence:
            1,
        },
      ],
      currentStepId:
        "step-tree-0833",
      completedStepIds: [],
      blockedReasons: [],
    };

  const runtime =
    new EngineeringRuntimeExecutor({
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
    });

  const pipeline =
    new EngineeringExecutionPipeline();

  const result =
    await pipeline.execute(
      {
        request: {
          id:
            "step-execution-tree-0833",
          projectId:
            "project-tree-0833",
          executionId:
            "execution-tree-0833",
          step:
            execution.steps[0],
          command,
        },
        execution,
        completedAt:
          new Date().toISOString(),
      },
      runtime,
    );

  assert(
    result.realExecution,
    "Pipeline must use the real runtime executor.",
  );

  assert(
    result.execution.status ===
      "completed",
    "Successful real execution must complete the execution loop.",
  );

  assert(
    result.execution.successfulCommandIds.includes(
      command.id,
    ),
    "Successful command must be recorded by the execution loop.",
  );

  assert(
    result.step.completed,
    "Successful real engineering step must be completed.",
  );

  assert(
    result.step.exitCode ===
      0,
    "Real pipeline execution must return exit code zero.",
  );

  assert(
    result.step.stdout.includes(
      "KINGS_PIPELINE_REAL",
    ),
    "Real pipeline stdout must reach the engineering step result.",
  );

  assert(
    result.step.evidence.some(
      (entry) =>
        entry ===
        "status:success",
    ),
    "Pipeline must preserve real execution evidence.",
  );

  console.log(
    "08.33 REAL EXECUTION PIPELINE: SUCCESS",
  );

  console.log(
    "08.33 EXECUTION LOOP INTEGRATION: SUCCESS",
  );

  console.log(
    "08.33 REAL RESULT PROPAGATION: SUCCESS",
  );

  console.log(
    "08.33 ENGINEERING EVIDENCE: SUCCESS",
  );

  console.log(
    "TREE-08.33 REAL EXECUTION PIPELINE BRIDGE: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode =
      1;
  },
);
