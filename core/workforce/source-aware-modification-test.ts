import {
  mkdir,
  rm,
  writeFile,
  readFile,
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
    "/tmp/kings-v1-modification-proof";

  const target =
    `${workspace}/existing.ts`;

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

  await writeFile(
    target,
    [
      "export function existingProof(): string {",
      "  return \"OLD_VALUE\";",
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
        "source-aware-modification-task",

      missionId:
        "source-aware-modification-mission",

      instruction:
        [
          "Modify the existing TypeScript file existing.ts.",
          "Do not replace the existing function with a different API.",
          "Keep the exported function name existingProof.",
          "Change its returned value from OLD_VALUE to KINGS_MODIFIED_GREEN.",
          "Preserve the existing file's overall structure.",
          "The final file must pass strict TypeScript compilation.",
          `Target file: ${target}`,
        ].join(" "),

      workspacePath:
        workspace,

      targetPath:
        target,

      allowedReadPaths: [
        workspace,
        target,
      ],

      allowedWritePaths: [
        target,
      ],

      maxFileBytes:
        64 * 1024,

      maxOutputTokens:
        1024,

      maxRepairAttempts:
        2,
    });

  assert(
    result.success,
    result.reasons.join(
      " | ",
    ) ||
      "Source-aware modification failed.",
  );

  const finalContent =
    await readFile(
      target,
      "utf8",
    );

  assert(
    finalContent.includes(
      "existingProof",
    ),
    "Existing exported function must be preserved.",
  );

  assert(
    finalContent.includes(
      "KINGS_MODIFIED_GREEN",
    ),
    "Existing function must be modified to the requested value.",
  );

  assert(
    !finalContent.includes(
      "OLD_VALUE",
    ),
    "Old implementation value must be removed.",
  );

  console.log(
    "001.SOURCE-AWARE MODIFICATION → EXISTING FILE READ: SUCCESS",
  );

  console.log(
    "002.SOURCE-AWARE MODIFICATION → REQUESTED CHANGE: SUCCESS",
  );

  console.log(
    "003.SOURCE-AWARE MODIFICATION → GOVERNED WRITE: SUCCESS",
  );

  console.log(
    `004.SOURCE-AWARE MODIFICATION → VERIFIED IN ${result.attempts} ATTEMPT(S): SUCCESS`,
  );

  console.log(
    "SOURCE-AWARE EXISTING-FILE MODIFICATION: SUCCESS",
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
