import type {
  SourceInspectionResult,
} from "./source-inspection";

import {
  RepositoryIndex,
  RepositoryIndexBuilder,
} from "./repository-index";

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

function inspection(
  path: string,
  sizeBytes: number,
): SourceInspectionResult {
  return {
    sourceId:
      "repository-source-test",
    operation: "metadata",
    path,
    sizeBytes,
    createdAt:
      "2026-08-12T00:00:00.000Z",
  };
}

function main(): void {
  const builder =
    new RepositoryIndexBuilder();

  const built =
    builder.build(
      "repository-index-test",
      "repository-source-test",
      "/home/test/KINGS-AI",
      [
        inspection(
          "core/workforce/project-brain.ts",
          1200,
        ),
        inspection(
          "core/workforce/types.ts",
          2400,
        ),
        inspection(
          "core/workforce/knowledge-retrieval.ts",
          3100,
        ),
        inspection(
          "README.md",
          800,
        ),
      ],
      "2026-08-12T00:00:00.000Z",
    );

  assert(
    built.id ===
      "repository-index-test",
    "Repository index identity was not preserved.",
  );

  console.log(
    "05.3 repository index identity: SUCCESS",
  );

  assert(
    built.sourceId ===
      "repository-source-test",
    "Repository source identity was not preserved.",
  );

  console.log(
    "05.3 repository source provenance: SUCCESS",
  );

  assert(
    built.root ===
      "/home/test/KINGS-AI",
    "Repository root was not preserved.",
  );

  console.log(
    "05.3 repository root preservation: SUCCESS",
  );

  assert(
    typeof built.snapshotHash ===
      "string" &&
      built.snapshotHash.length > 0,
    "Repository snapshot hash was not generated.",
  );

  console.log(
    "05.3 repository snapshot identity: SUCCESS",
  );

  const equivalent =
    builder.build(
      "equivalent-index",
      "repository-source-test",
      "/home/test/KINGS-AI",
      [
        inspection(
          "core/workforce/project-brain.ts",
          1200,
        ),
        inspection(
          "core/workforce/types.ts",
          2400,
        ),
        inspection(
          "core/workforce/knowledge-retrieval.ts",
          3100,
        ),
        inspection(
          "README.md",
          800,
        ),
      ],
      "2026-08-12T00:00:00.000Z",
    );

  assert(
    built.snapshotHash ===
      equivalent.snapshotHash,
    "Equivalent repository snapshots produced different snapshot identities.",
  );

  console.log(
    "05.3 deterministic snapshot identity: SUCCESS",
  );

  const changed =
    builder.build(
      "changed-index",
      "repository-source-test",
      "/home/test/KINGS-AI",
      [
        inspection(
          "core/workforce/project-brain.ts",
          1201,
        ),
        inspection(
          "core/workforce/types.ts",
          2400,
        ),
        inspection(
          "core/workforce/knowledge-retrieval.ts",
          3100,
        ),
        inspection(
          "README.md",
          800,
        ),
      ],
      "2026-08-12T00:00:00.000Z",
    );

  assert(
    built.snapshotHash !==
      changed.snapshotHash,
    "Changed repository metadata did not change snapshot identity.",
  );

  console.log(
    "05.3 changed-snapshot detection: SUCCESS",
  );

  assert(
    built.entries.length === 4,
    "Repository entry count is incorrect.",
  );

  console.log(
    "05.3 repository entry registration: SUCCESS",
  );

  assert(
    built.entries[0].path ===
      "README.md",
    "Repository entries were not deterministically sorted.",
  );

  assert(
    built.entries[1].path ===
      "core/workforce/knowledge-retrieval.ts",
    "Repository entry ordering is incorrect.",
  );

  console.log(
    "05.3 deterministic repository ordering: SUCCESS",
  );

  assert(
    built.entries.some(
      (entry) =>
        entry.path ===
          "core/workforce/project-brain.ts" &&
        entry.extension === "ts" &&
        entry.language ===
          "typescript",
    ),
    "TypeScript file metadata was not derived correctly.",
  );

  console.log(
    "05.3 file metadata classification: SUCCESS",
  );

  const index =
    new RepositoryIndex(
      built,
    );

  const exact =
    index.get(
      "core\\workforce\\types.ts",
    );

  assert(
    exact?.path ===
      "core/workforce/types.ts",
    "Normalized exact path lookup failed.",
  );

  console.log(
    "05.3 normalized path lookup: SUCCESS",
  );

  const typescript =
    index.find({
      extension: "ts",
    });

  assert(
    typescript.length === 3,
    "Extension filtering returned the wrong result count.",
  );

  console.log(
    "05.3 extension filtering: SUCCESS",
  );

  const language =
    index.find({
      language: "typescript",
    });

  assert(
    language.length === 3,
    "Language filtering returned the wrong result count.",
  );

  console.log(
    "05.3 language filtering: SUCCESS",
  );

  const pathMatches =
    index.find({
      path: "knowledge",
    });

  assert(
    pathMatches.length === 1 &&
      pathMatches[0].path ===
        "core/workforce/knowledge-retrieval.ts",
    "Path lookup did not locate the expected repository entry.",
  );

  console.log(
    "05.3 path search: SUCCESS",
  );

  const limited =
    index.find({
      extension: "ts",
      limit: 1,
    });

  assert(
    limited.length === 1,
    "Repository lookup limit was not enforced.",
  );

  console.log(
    "05.3 lookup limit: SUCCESS",
  );

  const zero =
    index.find({
      extension: "ts",
      limit: 0,
    });

  assert(
    zero.length === 0,
    "Explicit zero repository lookup limit was not respected.",
  );

  console.log(
    "05.3 explicit zero-limit safety: SUCCESS",
  );

  assert(
    index.get(
      "does-not-exist.ts",
    ) === undefined,
    "Unknown repository path did not return undefined.",
  );

  console.log(
    "05.3 unknown path safety: SUCCESS",
  );

  const first =
    index.find({
      path: "core/workforce",
    });

  const second =
    index.find({
      path: "core/workforce",
    });

  assert(
    JSON.stringify(first) ===
      JSON.stringify(second),
    "Repeated repository lookup was not deterministic.",
  );

  console.log(
    "05.3 repeated-query determinism: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    builder.build(
      "duplicate-test",
      "repository-source-test",
      "/home/test/KINGS-AI",
      [
        inspection(
          "core/workforce/types.ts",
          100,
        ),
        inspection(
          "core/workforce/types.ts",
          200,
        ),
      ],
    );
  } catch (error) {
    duplicateRejected =
      error instanceof Error &&
      error.message.includes(
        "duplicate repository path",
      );
  }

  assert(
    duplicateRejected,
    "Duplicate repository paths were not rejected.",
  );

  console.log(
    "05.3 duplicate path protection: SUCCESS",
  );

  let unsafeRejected =
    false;

  try {
    builder.build(
      "unsafe-path-test",
      "repository-source-test",
      "/home/test/KINGS-AI",
      [
        inspection(
          "../outside.ts",
          100,
        ),
      ],
    );
  } catch (error) {
    unsafeRejected =
      error instanceof Error &&
      error.message.includes(
        "invalid repository path",
      );
  }

  assert(
    unsafeRejected,
    "Repository traversal path was not rejected.",
  );

  console.log(
    "05.3 repository path boundary: SUCCESS",
  );

  console.log(
    "TREE-05.3 REPOSITORY INDEX FOUNDATION: SUCCESS",
  );
}

main();
