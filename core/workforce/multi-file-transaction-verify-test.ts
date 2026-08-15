import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  executeVerifiedMultiFileTransaction,
} from "./multi-file-transaction-verify";

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
    "/tmp/kings-v1-verified-transaction";

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
    "export const a = 'OLD_A';\n",
    "utf8",
  );

  await writeFile(
    second,
    "export const b = 'OLD_B';\n",
    "utf8",
  );

  const result =
    await executeVerifiedMultiFileTransaction({
      workspacePath:
        workspace,

      changes: [
        {
          path:
            first,

          operation:
            "replace",

          content:
            "export const a = 'VERIFIED_A_GREEN';\n",
        },
        {
          path:
            second,

          operation:
            "replace",

          content:
            "export const b = 'VERIFIED_B_GREEN';\n",
        },
      ],

      testCommand:
        process.execPath,

      testArgs: [
        "-e",
        [
          "const fs=require('fs');",
          "const a=fs.readFileSync('a.ts','utf8');",
          "const b=fs.readFileSync('b.ts','utf8');",
          "if (!a.includes('VERIFIED_A_GREEN') || !b.includes('VERIFIED_B_GREEN')) process.exit(9);",
          "console.log('KINGS_VERIFIED_TRANSACTION_GREEN');",
        ].join(""),
      ],

      timeoutMs:
        5000,

      maxOutputBytes:
        16 * 1024,
    });

  assert(
    result.success,
    result.reasons.join(
      " | ",
    ) ||
      "Verified transaction failed.",
  );

  assert(
    result.testResult?.success ===
      true,
    "Staged transaction test must pass.",
  );

  assert(
    result.appliedPaths.length ===
      2,
    "Both verified files must be applied.",
  );

  const finalA =
    await readFile(
      first,
      "utf8",
    );

  const finalB =
    await readFile(
      second,
      "utf8",
    );

  assert(
    finalA.includes(
      "VERIFIED_A_GREEN",
    ),
    "Verified A was not promoted.",
  );

  assert(
    finalB.includes(
      "VERIFIED_B_GREEN",
    ),
    "Verified B was not promoted.",
  );

  console.log(
    "001.VERIFIED TRANSACTION → STAGE: SUCCESS",
  );

  console.log(
    "002.VERIFIED TRANSACTION → COMPLETE PROJECT TEST: SUCCESS",
  );

  console.log(
    "003.VERIFIED TRANSACTION → PROMOTION AFTER PASS: SUCCESS",
  );

  console.log(
    "004.VERIFIED TRANSACTION → TWO FILES APPLIED: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. VERIFIED MULTI-FILE TRANSACTION: SUCCESS",
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
