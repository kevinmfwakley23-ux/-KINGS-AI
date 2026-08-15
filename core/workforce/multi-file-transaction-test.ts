import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  applyMultiFileTransaction,
  cleanupMultiFileTransaction,
  stageMultiFileTransaction,
} from "./multi-file-transaction";

import type {
  MultiFileCodingProposal,
} from "./multi-file-proposal";

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
    "/tmp/kings-v1-atomic-proof";

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

  const proposal:
    MultiFileCodingProposal = {
    id:
      "atomic-proposal",

    taskId:
      "atomic-task",

    missionId:
      "atomic-mission",

    summary:
      "Replace two files atomically.",

    changes: [
      {
        path:
          first,

        operation:
          "replace",

        content:
          "export const a = 'ATOMIC_A_GREEN';\n",
      },
      {
        path:
          second,

        operation:
          "replace",

        content:
          "export const b = 'ATOMIC_B_GREEN';\n",
      },
    ],
  };

  const staged =
    await stageMultiFileTransaction({
      workspacePath:
        workspace,

      changes:
        proposal.changes,
    });

  assert(
    staged.success,
    staged.reasons.join(
      " | ",
    ) ||
      "Staging failed.",
  );

  assert(
    staged.verifiedPaths.length ===
      2,
    "Both files must be staged.",
  );

  const originalA =
    await readFile(
      first,
      "utf8",
    );

  const originalB =
    await readFile(
      second,
      "utf8",
    );

  assert(
    originalA.includes(
      "OLD_A",
    ),
    "Original A must remain untouched before apply.",
  );

  assert(
    originalB.includes(
      "OLD_B",
    ),
    "Original B must remain untouched before apply.",
  );

  const applied =
    await applyMultiFileTransaction(
      {
        workspacePath:
          workspace,

        changes:
          proposal.changes,
      },
      staged.stagedWorkspacePath,
    );

  assert(
    applied.success,
    applied.reasons.join(
      " | ",
    ) ||
      "Apply failed.",
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
      "ATOMIC_A_GREEN",
    ),
    "A was not applied.",
  );

  assert(
    finalB.includes(
      "ATOMIC_B_GREEN",
    ),
    "B was not applied.",
  );

  await cleanupMultiFileTransaction(
    staged.stagedWorkspacePath,
  );

  console.log(
    "001.ATOMIC MULTI-FILE → STAGE: SUCCESS",
  );

  console.log(
    "002.ATOMIC MULTI-FILE → ORIGINALS PRESERVED BEFORE APPLY: SUCCESS",
  );

  console.log(
    "003.ATOMIC MULTI-FILE → COMPLETE APPLY: SUCCESS",
  );

  console.log(
    "004.ATOMIC MULTI-FILE → TWO FILES VERIFIED: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. ATOMIC MULTI-FILE TRANSACTION: SUCCESS",
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
