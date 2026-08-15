import {
  mkdir,
  rm,
} from "node:fs/promises";

import {
  LocalCodingVerificationLoop,
} from "./local-coding-verification-loop";

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
  const workspace =
    "/tmp/kings-coding-repair-proof";

  await rm(
    workspace,
    {
      recursive: true,
      force: true,
    },
  );

  await mkdir(
    workspace,
    {
      recursive: true,
    },
  );

  const target =
    `${workspace}/generated.ts`;

  const loop =
    new LocalCodingVerificationLoop();

  const result =
    await loop.execute({
      taskId:
        "repair-task-001",

      missionId:
        "repair-mission-001",

      instruction:
        [
          "Create a TypeScript file named generated.ts.",
          "Export a function named kingsRepairProof.",
          "The function must return exactly KINGS_REPAIR_GREEN as a string.",
          "The final file must pass strict TypeScript compilation.",
          "The target file is:",
          target,
        ].join(" "),

      workspacePath:
        workspace,

      targetPath:
        target,

      allowedReadPaths: [
        workspace,
      ],

      allowedWritePaths: [
        target,
      ],

      maxFileBytes:
        64 * 1024,

      maxOutputTokens:
        768,

      maxRepairAttempts:
        2,
    });

  assert(
    result.success,
    result.reasons.join(
      " | ",
    ) ||
      "Verification loop failed.",
  );

  assert(
    result.writtenPaths.length >
      0,
    "Verification loop must write a file.",
  );

  console.log(
    "001.CODING LOOP → LOCAL MODEL: SUCCESS",
  );

  console.log(
    "002.CODING LOOP → GOVERNED WRITE: SUCCESS",
  );

  console.log(
    "003.CODING LOOP → COMPILER VERIFICATION: SUCCESS",
  );

  console.log(
    `004.CODING LOOP → ATTEMPTS: ${result.attempts}`,
  );

  console.log(
    "K.I.N.G.S. CODING MACHINE V1 — REPAIR LOOP: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );
  },
);
