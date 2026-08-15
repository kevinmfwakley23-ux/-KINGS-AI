import type {
  BuiltEngineeringCommand,
} from "./engineering-command-builder";

import {
  LocalCodingEngineeringExecutor,
} from "./local-coding-engineering-executor";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const executor =
    new LocalCodingEngineeringExecutor();

  const command:
    BuiltEngineeringCommand = {
    id:
      "local-engineering-proof",

    projectId:
      "local-engineering-project",

    operation:
      "build",

    language:
      "typescript",

    executable:
      "local-kings-coding-master",

    args:
      [],

    workingDirectory:
      "/tmp/kings-local-engineering-proof",

    authorized:
      true,

    description:
      "Create a TypeScript function named kingsLocalEngineeringProof that returns the exact string KINGS_LOCAL_ENGINEERING_GREEN.",
  };

  const result =
    await executor.execute(
      command,
    );

  assert(
    result.exitCode ===
      0,
    result.stderr ||
      "Local coding engineering executor failed.",
  );

  assert(
    result.stdout.includes(
      "K.I.N.G.S. LOCAL CODING MASTER: SUCCESS",
    ),
    "The engineering executor must report local K.I.N.G.S. success.",
  );

  console.log(
    "001.LOCAL ENGINEERING EXECUTOR → LOCAL CODING MASTER: SUCCESS",
  );

  console.log(
    "002.LOCAL ENGINEERING EXECUTOR → ENGINEERING COMMAND CONTRACT: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. LOCAL ENGINEERING EXECUTOR: SUCCESS",
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
