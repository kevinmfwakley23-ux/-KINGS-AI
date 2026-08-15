import {
  mkdir,
  writeFile,
  readFile,
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
    "/tmp/kings-v1-multifile-worker-proof";

  const first =
    `${workspace}/a.ts`;

  const second =
    `${workspace}/b.ts`;

  await rm(
    workspace,
    {
      recursive:
        true,
      force:
        true,
    },
  );

  await mkdir(
    workspace,
    {
      recursive:
        true,
    },
  );

  await writeFile(
    first,
    [
      "export function first(): string {",
      "  return 'OLD_A';",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    second,
    [
      "export function second(): string {",
      "  return 'OLD_B';",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  const loop =
    new LocalCodingVerificationLoop();

  const result =
    await loop.execute({
      taskId:
        "multifile-worker-task",

      missionId:
        "multifile-worker-mission",

      instruction:
        [
          "Modify BOTH existing TypeScript files in one coordinated change.",
          "Change first() to return the exact string KINGS_MULTI_A_GREEN.",
          "Change second() to return the exact string KINGS_MULTI_B_GREEN.",
          "Return both files in MULTI-FILE MODE.",
        ].join(" "),

      workspacePath:
        workspace,

      targetPath:
        first,

      allowedReadPaths: [
        first,
        second,
      ],

      allowedWritePaths: [
        first,
        second,
      ],

      maxFileBytes:
        32 * 1024,

      maxOutputTokens:
        768,

      maxRepairAttempts:
        1,
    });

  assert(
    result.success,
    result.reasons.join(
      " | ",
    ) ||
      "Multi-file worker failed.",
  );

  const a =
    await readFile(
      first,
      "utf8",
    );

  const b =
    await readFile(
      second,
      "utf8",
    );

  assert(
    a.includes(
      "KINGS_MULTI_A_GREEN",
    ),
    "First file was not updated.",
  );

  assert(
    b.includes(
      "KINGS_MULTI_B_GREEN",
    ),
    "Second file was not updated.",
  );

  assert(
    result.writtenPaths.length ===
      2,
    "Exactly two files must be written.",
  );

  console.log(
    "001.MULTI-FILE WORKER → MODEL PROPOSAL: SUCCESS",
  );

  console.log(
    "002.MULTI-FILE WORKER → TWO AUTHORIZED FILES: SUCCESS",
  );

  console.log(
    "003.MULTI-FILE WORKER → GOVERNED WRITES: SUCCESS",
  );

  console.log(
    `004.MULTI-FILE WORKER → VERIFIED IN ${result.attempts} ATTEMPT(S): SUCCESS`,
  );

  console.log(
    "K.I.N.G.S. MULTI-FILE WORKER: SUCCESS",
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
