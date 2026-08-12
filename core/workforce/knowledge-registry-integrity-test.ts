import type {
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
} from "./types";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

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

function expectFailure(
  action: () => void,
  messageFragment: string,
  label: string,
): void {
  let failed = false;

  try {
    action();
  } catch (error) {
    failed =
      error instanceof Error &&
      error.message.includes(messageFragment);
  }

  assert(
    failed,
    label,
  );
}

function createSource(
  id: string,
  authoritative = true,
): KnowledgeSource {
  return {
    id,
    type: "construction-document",
    name: `Knowledge Source ${id}`,
    description: `Test knowledge source ${id}.`,
    location: `/tmp/${id}.md`,
    authoritative,
    version: "1.0.0",
    contentHash: `hash-${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createEvidence(
  id: string,
  sourceId: string,
): Evidence {
  return {
    id,
    sourceId,
    description: `Evidence ${id}.`,
    location: "test-section",
    excerpt: `Evidence excerpt ${id}.`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function createRecord(
  id: string,
  sourceId: string,
  evidenceIds: string[] = [],
  authoritative = true,
): KnowledgeRecord {
  return {
    id,
    sourceId,
    memoryType: "semantic",
    summary: `Knowledge record ${id}.`,
    content: `Knowledge content ${id}.`,
    evidenceIds,
    authoritative,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function main(): void {
  const registry = new KnowledgeRegistry();

  const sourceA = createSource(
    "source-integrity-a",
  );

  const sourceB = createSource(
    "source-integrity-b",
  );

  const evidenceA = createEvidence(
    "evidence-integrity-a",
    sourceA.id,
  );

  const evidenceB = createEvidence(
    "evidence-integrity-b",
    sourceB.id,
  );

  registry.registerSource(sourceA);
  registry.registerSource(sourceB);

  registry.registerEvidence(
    evidenceA,
  );

  registry.registerEvidence(
    evidenceB,
  );

  registry.registerRecord(
    createRecord(
      "knowledge-integrity-a",
      sourceA.id,
      [evidenceA.id],
    ),
  );

  console.log(
    "05.1 source registration integrity: SUCCESS",
  );

  console.log(
    "05.1 evidence registration integrity: SUCCESS",
  );

  console.log(
    "05.1 knowledge registration integrity: SUCCESS",
  );

  expectFailure(
    () =>
      registry.registerEvidence(
        createEvidence(
          "evidence-orphan",
          "source-missing",
        ),
      ),
    'must be registered before evidence',
    "Evidence without a registered source was not rejected.",
  );

  console.log(
    "05.1 orphan evidence rejection: SUCCESS",
  );

  expectFailure(
    () =>
      registry.registerRecord(
        createRecord(
          "knowledge-orphan",
          "source-missing",
        ),
      ),
    'must be registered before knowledge record',
    "Knowledge without a registered source was not rejected.",
  );

  console.log(
    "05.1 orphan knowledge rejection: SUCCESS",
  );

  expectFailure(
    () =>
      registry.registerRecord(
        createRecord(
          "knowledge-missing-evidence",
          sourceA.id,
          ["evidence-missing"],
        ),
      ),
    'must be registered before knowledge record',
    "Knowledge referencing missing evidence was not rejected.",
  );

  console.log(
    "05.1 missing evidence rejection: SUCCESS",
  );

  expectFailure(
    () =>
      registry.registerRecord(
        createRecord(
          "knowledge-cross-source",
          sourceA.id,
          [evidenceB.id],
        ),
      ),
    "does not belong to source",
    "Cross-source evidence was not rejected.",
  );

  console.log(
    "05.1 cross-source provenance rejection: SUCCESS",
  );

  expectFailure(
    () =>
      registry.registerSource(
        sourceA,
      ),
    "duplicate knowledge source",
    "Duplicate source was not rejected.",
  );

  expectFailure(
    () =>
      registry.registerEvidence(
        evidenceA,
      ),
    "duplicate evidence",
    "Duplicate evidence was not rejected.",
  );

  expectFailure(
    () =>
      registry.registerRecord(
        createRecord(
          "knowledge-integrity-a",
          sourceA.id,
          [evidenceA.id],
        ),
      ),
    "duplicate knowledge record",
    "Duplicate knowledge record was not rejected.",
  );

  console.log(
    "05.1 duplicate protection: SUCCESS",
  );

  const sourceList =
    registry.listSources();

  assert(
    sourceList.map(
      (source) => source.id,
    ).join("|") ===
      "source-integrity-a|source-integrity-b",
    "Source listing order was not deterministic.",
  );

  const evidenceList =
    registry.listEvidence();

  assert(
    evidenceList.map(
      (evidence) => evidence.id,
    ).join("|") ===
      "evidence-integrity-a|evidence-integrity-b",
    "Evidence listing order was not deterministic.",
  );

  const recordList =
    registry.listRecords();

  assert(
    recordList.map(
      (record) => record.id,
    ).join("|") ===
      "knowledge-integrity-a",
    "Knowledge listing order was not deterministic.",
  );

  console.log(
    "05.1 deterministic source listing: SUCCESS",
  );

  console.log(
    "05.1 deterministic evidence listing: SUCCESS",
  );

  console.log(
    "05.1 deterministic knowledge listing: SUCCESS",
  );

  const secondRegistry =
    new KnowledgeRegistry();

  assert(
    secondRegistry.listSources().length === 0,
    "New registry inherited sources from another registry.",
  );

  assert(
    secondRegistry.listEvidence().length === 0,
    "New registry inherited evidence from another registry.",
  );

  assert(
    secondRegistry.listRecords().length === 0,
    "New registry inherited records from another registry.",
  );

  console.log(
    "05.1 registry isolation: SUCCESS",
  );

  registry.clear();

  assert(
    registry.listSources().length === 0 &&
    registry.listEvidence().length === 0 &&
    registry.listRecords().length === 0,
    "Registry clear did not remove all registered knowledge state.",
  );

  console.log(
    "05.1 registry clear integrity: SUCCESS",
  );

  console.log(
    "TREE-05.1 KNOWLEDGE REGISTRY INTEGRITY: SUCCESS",
  );
}

main();
