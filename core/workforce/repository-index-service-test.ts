import type {
  SourceInspectionResult,
} from "./source-inspection";

import {
  RepositoryIndexService,
} from "./repository-index-service";

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
      "repository-source-service-test",
    operation: "metadata",
    path,
    sizeBytes,
    createdAt:
      "2026-08-12T00:00:00.000Z",
  };
}

function main(): void {
  const service =
    new RepositoryIndexService();

  const request = {
    indexId:
      "repository-index-service-test",
    sourceId:
      "repository-source-service-test",
    repositoryRoot:
      "/home/test/KINGS-AI",
    inspections: [
      inspection(
        "core/workforce/types.ts",
        2400,
      ),
      inspection(
        "core/workforce/project-brain.ts",
        1200,
      ),
      inspection(
        "README.md",
        800,
      ),
    ],
    indexedAt:
      "2026-08-12T00:00:00.000Z",
  };

  const index =
    service.build(
      request,
    );

  assert(
    index.metadata.id ===
      "repository-index-service-test",
    "Service did not preserve repository index identity.",
  );

  console.log(
    "05.3 source-inspection bridge identity: SUCCESS",
  );

  assert(
    index.metadata.sourceId ===
      "repository-source-service-test",
    "Service did not preserve source provenance.",
  );

  console.log(
    "05.3 source-inspection provenance bridge: SUCCESS",
  );

  assert(
    index.metadata.root ===
      "/home/test/KINGS-AI",
    "Service did not preserve repository root.",
  );

  console.log(
    "05.3 source-inspection repository root bridge: SUCCESS",
  );

  assert(
    index.metadata.entries.length ===
      3,
    "Service did not register all inspected repository entries.",
  );

  console.log(
    "05.3 inspected-entry registration: SUCCESS",
  );

  const typescript =
    index.find({
      language:
        "typescript",
    });

  assert(
    typescript.length === 2,
    "Service index did not preserve TypeScript classification.",
  );

  console.log(
    "05.3 inspected-language classification: SUCCESS",
  );

  const exact =
    index.get(
      "core/workforce/types.ts",
    );

  assert(
    exact?.sizeBytes ===
      2400,
    "Service index did not preserve inspected file metadata.",
  );

  console.log(
    "05.3 inspected-file metadata preservation: SUCCESS",
  );

  const first =
    service.build(
      request,
    );

  const second =
    service.build(
      request,
    );

  assert(
    JSON.stringify(
      first.metadata,
    ) ===
      JSON.stringify(
        second.metadata,
      ),
    "Equivalent source-inspection inputs did not produce deterministic indexes.",
  );

  console.log(
    "05.3 deterministic source-inspection indexing: SUCCESS",
  );

  const rebuilt =
    service.rebuild(
      request,
    );

  assert(
    JSON.stringify(
      rebuilt.metadata,
    ) ===
      JSON.stringify(
        first.metadata,
      ),
    "Repository index rebuild was not deterministic.",
  );

  console.log(
    "05.3 deterministic rebuild: SUCCESS",
  );

  const limited =
    index.find({
      language:
        "typescript",
      limit: 1,
    });

  assert(
    limited.length === 1,
    "Repository index service did not preserve lookup limits.",
  );

  console.log(
    "05.3 service lookup boundary: SUCCESS",
  );

  const zero =
    index.find({
      language:
        "typescript",
      limit: 0,
    });

  assert(
    zero.length === 0,
    "Repository index service did not preserve zero-limit safety.",
  );

  console.log(
    "05.3 service zero-limit safety: SUCCESS",
  );

  console.log(
    "TREE-05.3 SOURCE INSPECTION INDEX BRIDGE: SUCCESS",
  );
}

main();
