import {
  validateMultiFileProposal,
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
  const taskId =
    "multifile-contract-task";

  const missionId =
    "multifile-contract-mission";

  const first =
    "/tmp/kings-v1-multifile-contract/a.ts";

  const second =
    "/tmp/kings-v1-multifile-contract/b.ts";

  const proposal =
    validateMultiFileProposal(
      {
        id:
          "proposal-multifile-contract",

        taskId,

        missionId,

        summary:
          "Replace two coordinated TypeScript files.",

        changes: [
          {
            path:
              first,

            operation:
              "replace",

            content:
              "export const a = 'A_GREEN';",
          },
          {
            path:
              second,

            operation:
              "replace",

            content:
              "export const b = 'B_GREEN';",
          },
        ],
      },

      taskId,

      missionId,

      [
        first,
        second,
      ],
    );

  assert(
    proposal.changes.length ===
      2,
    "Two file changes must survive validation.",
  );

  assert(
    proposal.changes[0].operation ===
      "replace",
    "First file must preserve replace.",
  );

  assert(
    proposal.changes[1].operation ===
      "replace",
    "Second file must preserve replace.",
  );

  let rejected =
    false;

  try {
    validateMultiFileProposal(
      {
        ...proposal,
        changes: [
          ...proposal.changes,
          {
            path:
              "/tmp/not-authorized.ts",

            operation:
              "replace",

            content:
              "export const blocked = true;",
          },
        ],
      },
      taskId,
      missionId,
      [
        first,
        second,
      ],
    );
  } catch {
    rejected =
      true;
  }

  assert(
    rejected,
    "Unauthorized multi-file paths must be rejected.",
  );

  console.log(
    "001.MULTI-FILE CONTRACT → TWO CHANGES: SUCCESS",
  );

  console.log(
    "002.MULTI-FILE CONTRACT → REPLACE SEMANTICS: SUCCESS",
  );

  console.log(
    "003.MULTI-FILE CONTRACT → PATH GOVERNANCE: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. MULTI-FILE PROPOSAL CONTRACT: SUCCESS",
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
