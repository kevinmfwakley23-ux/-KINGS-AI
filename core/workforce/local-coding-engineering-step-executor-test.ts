import {
  LocalCodingEngineeringStepExecutor,
} from "./local-coding-engineering-step-executor";

import type {
  AutonomousEngineeringExecution,
} from "./autonomous-engineering-execution";

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

async function main(): Promise<void> {
  const root =
    "/tmp/kings-local-master-step-proof";

  const execution:
    AutonomousEngineeringExecution =
    {
      id:
        "engineering-execution-local-master",

      projectId:
        "project-local-master",

      status:
        "ready",

      steps: [
        {
          id:
            "engineering-step-local-master",

          language:
            "typescript",

          operation:
            "create",

          capabilityId:
            "engineering-typescript",

          sequence:
            1,
        },
      ],

      currentStepId:
        "engineering-step-local-master",

      completedStepIds:
        [],

      blockedReasons:
        [],
    };

  const command:
    BuiltEngineeringCommand =
    {
      id:
        "command-local-master",

      projectId:
        "project-local-master",

      executionStepId:
        "engineering-step-local-master",

      language:
        "typescript",

      operation:
        "create",

      executable:
        "local-kings-coding-master",

      args:
        [],

      workingDirectory:
        root,

      authorized:
        true,
    };

  const executor =
    new LocalCodingEngineeringStepExecutor();

  const result =
    await executor.execute(
      {
        id:
          "step-execution-local-master",

        projectId:
          "project-local-master",

        executionId:
          "engineering-execution-local-master",

        step:
          execution.steps[0],

        command,

      engineeringIntent:
        [
          "Create a TypeScript source file.",
          "Export a function named kingsLocalMasterProof.",
          "The function must return the exact string KINGS_LOCAL_MASTER_GREEN.",
          "",
          "The authorized workspace is the working directory itself.",
          "Write the file as generated/kingsLocalMasterProof.ts.",
          "Use the K.I.N.G.S. coding proposal protocol:",
          "SUMMARY:",
          "OPERATION: create",
          "PATH: generated/kingsLocalMasterProof.ts",
          "CONTENT:",
          "complete TypeScript source only.",
        ].join(
          "\n",
        ),
      },
      execution,
    );

  assert(
    result.started,
    "The governed local engineering step must start.",
  );

  assert(
    result.completed,
    result.stderr ||
      "The local coding master must complete the engineering step.",
  );

  assert(
    result.exitCode ===
      0,
    "Successful local coding execution must return exit code zero.",
  );

  assert(
    result.evidence.includes(
      "local-coding-worker:success",
    ),
    "Execution evidence must identify the local K.I.N.G.S. coding master.",
  );

  console.log(
    "001.LOCAL MASTER STEP → GOVERNED ENGINEERING VALIDATION: SUCCESS",
  );

  console.log(
    "002.LOCAL MASTER STEP → K.I.N.G.S. LOCAL CODING WORKER: SUCCESS",
  );

  console.log(
    "003.LOCAL MASTER STEP → ENGINEERING RESULT: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. LOCAL CODING MASTER STEP: SUCCESS",
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
