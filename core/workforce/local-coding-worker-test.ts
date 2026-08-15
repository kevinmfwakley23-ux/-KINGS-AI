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

  const workspace =
    "/tmp/kings-local-worker-proof";

  const result =
    await worker.execute({
      id:
        "local-coding-worker-request-001",

      taskId:
        "local-coding-worker-task-001",

      missionId:
        "local-coding-worker-mission-001",

      instruction:
        "Create a TypeScript file named generated.ts containing one exported function named kingsBuildProof that returns the exact string KINGS_LOCAL_WORKER_GREEN. The generated TypeScript must compile with strict TypeScript.",

      workspacePath:
        workspace,

      allowedWritePaths: [
        `${workspace}/generated.ts`,
      ],

      allowedReadPaths: [
        workspace,
      ],

      maxFileBytes:
        64 * 1024,

      maxOutputTokens:
        512,

      modelId:
        "qwen2.5-coder:0.5b",
    });

  assert(
    result.success,
    result.reasons.join(
      " | ",
    ) ||
      "Local coding worker failed.",
  );

  assert(
    result.proposal !==
      undefined,
    "Local coding proposal must be present.",
  );

  assert(
    result.writtenPaths.includes(
      `${workspace}/generated.ts`,
    ),
    "Generated file must be written only to the authorized path.",
  );

  console.log(
    "001.LOCAL CODING WORKER → MODEL EXECUTION: SUCCESS",
  );

  console.log(
    "002.LOCAL CODING WORKER → GOVERNED PROPOSAL: SUCCESS",
  );

  console.log(
    "003.LOCAL CODING WORKER → AUTHORIZED FILE WRITE: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. LOCAL CODING WORKER: SUCCESS",
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
