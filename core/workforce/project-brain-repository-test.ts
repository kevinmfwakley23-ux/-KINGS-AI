import type {
  SourceInspectionResult,
} from "./source-inspection";

import {
  RepositoryIndex,
  RepositoryIndexBuilder,
} from "./repository-index";

import {
  ProjectBrainRepositoryStore,
} from "./project-brain-repository";

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
  sourceId: string,
  path: string,
  sizeBytes: number,
): SourceInspectionResult {
  return {
    sourceId,
    operation: "metadata",
    path,
    sizeBytes,
    createdAt:
      "2026-08-12T00:00:00.000Z",
  };
}

function buildIndex(
  builder: RepositoryIndexBuilder,
  indexId: string,
  sourceId: string,
  root: string,
  entries:
    Array<[string, number]>,
): RepositoryIndex {
  const snapshot =
    builder.build(
      indexId,
      sourceId,
      root,
      entries.map(
        ([path, sizeBytes]) =>
          inspection(
            sourceId,
            path,
            sizeBytes,
          ),
      ),
      "2026-08-12T00:00:00.000Z",
    );

  return new RepositoryIndex(
    snapshot,
  );
}

function main(): void {
  const builder =
    new RepositoryIndexBuilder();

  const index =
    buildIndex(
      builder,
      "project-brain-repository-index",
      "project-brain-repository-source",
      "/home/test/KINGS-AI",
      [
        [
          "core/workforce/types.ts",
          2400,
        ],
        [
          "core/workforce/project-brain.ts",
          1200,
        ],
        [
          "core/workforce/knowledge-retrieval.ts",
          3100,
        ],
      ],
    );

  const store =
    new ProjectBrainRepositoryStore();

  const reference =
    store.register(
      index,
    );

  assert(
    reference.repositoryIndexId ===
      "project-brain-repository-index",
    "Project Brain repository reference did not preserve index identity.",
  );

  console.log(
    "05.3 Project Brain repository identity: SUCCESS",
  );

  assert(
    reference.sourceId ===
      "project-brain-repository-source",
    "Project Brain repository reference did not preserve source provenance.",
  );

  console.log(
    "05.3 Project Brain repository provenance: SUCCESS",
  );

  assert(
    reference.repositoryRoot ===
      "/home/test/KINGS-AI",
    "Project Brain repository reference did not preserve repository root.",
  );

  console.log(
    "05.3 Project Brain repository root: SUCCESS",
  );

  assert(
    reference.entryCount === 3,
    "Project Brain repository reference did not preserve entry count.",
  );

  console.log(
    "05.3 Project Brain repository entry count: SUCCESS",
  );

  const exact =
    store.find(
      "project-brain-repository-index",
      {
        path:
          "core/workforce/types.ts",
      },
    );

  assert(
    exact.length === 1 &&
      exact[0].path ===
        "core/workforce/types.ts",
    "Project Brain repository exact lookup failed.",
  );

  console.log(
    "05.3 Project Brain exact repository lookup: SUCCESS",
  );

  const typescript =
    store.find(
      "project-brain-repository-index",
      {
        language:
          "typescript",
      },
    );

  assert(
    typescript.length === 3,
    "Project Brain repository language lookup failed.",
  );

  console.log(
    "05.3 Project Brain repository language lookup: SUCCESS",
  );

  const knowledge =
    store.find(
      "project-brain-repository-index",
      {
        path:
          "knowledge",
      },
    );

  assert(
    knowledge.length === 1 &&
      knowledge[0].path ===
        "core/workforce/knowledge-retrieval.ts",
    "Project Brain repository path lookup failed.",
  );

  console.log(
    "05.3 Project Brain repository path lookup: SUCCESS",
  );

  const limited =
    store.find(
      "project-brain-repository-index",
      {
        language:
          "typescript",
        limit: 1,
      },
    );

  assert(
    limited.length === 1,
    "Project Brain repository lookup limit was not preserved.",
  );

  console.log(
    "05.3 Project Brain repository lookup limit: SUCCESS",
  );

  const zero =
    store.find(
      "project-brain-repository-index",
      {
        language:
          "typescript",
        limit: 0,
      },
    );

  assert(
    zero.length === 0,
    "Project Brain repository zero-limit boundary was not preserved.",
  );

  console.log(
    "05.3 Project Brain repository zero-limit safety: SUCCESS",
  );

  let unknownRejected =
    false;

  try {
    store.find(
      "missing-repository-index",
      {
        path: "anything",
      },
    );
  } catch (error) {
    unknownRejected =
      error instanceof Error &&
      error.message.includes(
        "unknown repository index",
      );
  }

  assert(
    unknownRejected,
    "Unknown Project Brain repository index was not rejected.",
  );

  console.log(
    "05.3 unknown repository index rejection: SUCCESS",
  );

  const secondIndex =
    buildIndex(
      builder,
      "another-project-repository-index",
      "another-project-repository-source",
      "/home/test/OTHER",
      [
        [
          "README.md",
          800,
        ],
        [
          "src/main.ts",
          1400,
        ],
      ],
    );

  store.register(
    secondIndex,
  );

  const all =
    store.findAll();

  assert(
    all.length === 5,
    "Project Brain aggregate repository lookup returned the wrong number of entries.",
  );

  assert(
    all[0].path ===
      "README.md" &&
      all[1].path ===
        "core/workforce/knowledge-retrieval.ts" &&
      all[2].path ===
        "core/workforce/project-brain.ts" &&
      all[3].path ===
        "core/workforce/types.ts" &&
      all[4].path ===
        "src/main.ts",
    "Project Brain aggregate repository lookup was not deterministic.",
  );

  console.log(
    "05.3 deterministic aggregate repository lookup: SUCCESS",
  );

  const repeatedFirst =
    store.findAll();

  const repeatedSecond =
    store.findAll();

  assert(
    JSON.stringify(
      repeatedFirst,
    ) ===
      JSON.stringify(
        repeatedSecond,
      ),
    "Repeated aggregate repository lookup was not deterministic.",
  );

  console.log(
    "05.3 repeated aggregate lookup determinism: SUCCESS",
  );

  const listed =
    store.list();

  assert(
    listed.length === 2 &&
      listed[0].repositoryIndexId ===
        "another-project-repository-index" &&
      listed[1].repositoryIndexId ===
        "project-brain-repository-index",
    "Project Brain repository listing was not deterministic.",
  );

  console.log(
    "05.3 deterministic Project Brain repository listing: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    store.register(
      index,
    );
  } catch (error) {
    duplicateRejected =
      error instanceof Error &&
      error.message.includes(
        "duplicate repository index",
      );
  }

  assert(
    duplicateRejected,
    "Duplicate Project Brain repository registration was not rejected.",
  );

  console.log(
    "05.3 duplicate Project Brain repository protection: SUCCESS",
  );

  store.clear();

  assert(
    store.list().length === 0 &&
      store.findAll().length === 0,
    "Project Brain repository clear did not clear indexes and references.",
  );

  console.log(
    "05.3 Project Brain repository clear integrity: SUCCESS",
  );

  console.log(
    "TREE-05.3 PROJECT BRAIN REPOSITORY LOOKUP: SUCCESS",
  );
}

main();
