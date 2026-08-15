import type {
  BuiltEngineeringCommand,
} from "./engineering-command-builder";

import {
  LocalCodingEngineeringExecutor,
} from "./local-coding-engineering-executor";

import {
  LocalCodingWorker,
} from "./local-coding-worker";

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
  const worker =
    new LocalCodingWorker();

  /*
   * Deterministic test seam.
   *
   * The production executor still uses LocalCodingWorker normally.
   * This test replaces only the worker execution boundary so the
   * engineering executor can be validated without requiring Ollama.
   */
  (worker as any).execute =
    async () => ({
      success:
        true,

      writtenPaths: [
        "generated/kingsLocalEngineeringProof.ts",
      ],

      reasons: [
        "deterministic-engineering-test",
      ],
    });

  const executor =
    new LocalCodingEngineeringExecutor({
      worker,
    });

  const command:
    BuiltEngineeringCommand = {
    id:
      "local-engineering-proof",

    projectId:
      "local-engineering-project",

    executionStepId:
      "local-engineering-step-proof",

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

  assert(
    result.stdout.includes(
      "WROTE: generated/kingsLocalEngineeringProof.ts",
    ),
    "The engineering executor must preserve written-file evidence.",
  );

  console.log(
    "001.LOCAL ENGINEERING EXECUTOR → LOCAL CODING MASTER: SUCCESS",
  );

  console.log(
    "002.LOCAL ENGINEERING EXECUTOR → ENGINEERING COMMAND CONTRACT: SUCCESS",
  );

  console.log(
    "003.LOCAL ENGINEERING EXECUTOR → DETERMINISTIC WORKER BOUNDARY: SUCCESS",
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
