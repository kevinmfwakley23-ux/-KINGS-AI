import type {
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
  MemoryType,
} from "./types";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

import {
  KnowledgeRetrieval,
} from "./knowledge-retrieval";

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

function createSource(
  id: string,
  authoritative = true,
): KnowledgeSource {
  return {
    id,
    type: "construction-document",
    name: `Retrieval Source ${id}`,
    description: `Retrieval test source ${id}.`,
    location: `/tmp/${id}.md`,
    authoritative,
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
    location: `section-${id}`,
    excerpt: `Evidence excerpt ${id}.`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function createRecord(
  id: string,
  sourceId: string,
  summary: string,
  memoryType: MemoryType = "semantic",
  authoritative = true,
  evidenceIds: string[] = [],
): KnowledgeRecord {
  return {
    id,
    sourceId,
    memoryType,
    summary,
    evidenceIds,
    authoritative,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildRegistry(): KnowledgeRegistry {
  const registry =
    new KnowledgeRegistry();

  const sourceA =
    createSource(
      "source-retrieval-a",
      true,
    );

  const sourceB =
    createSource(
      "source-retrieval-b",
      true,
    );

  const sourceC =
    createSource(
      "source-retrieval-c",
      false,
    );

  registry.registerSource(sourceA);
  registry.registerSource(sourceB);
  registry.registerSource(sourceC);

  registry.registerEvidence(
    createEvidence(
      "evidence-retrieval-a",
      sourceA.id,
    ),
  );

  registry.registerEvidence(
    createEvidence(
      "evidence-retrieval-b",
      sourceB.id,
    ),
  );

  registry.registerRecord(
    createRecord(
      "knowledge-exact",
      sourceA.id,
      "Collector Profile authentication requirements",
      "semantic",
      true,
      ["evidence-retrieval-a"],
    ),
  );

  registry.registerRecord(
    createRecord(
      "knowledge-partial",
      sourceB.id,
      "Collector authentication requirements",
      "semantic",
      true,
      ["evidence-retrieval-b"],
    ),
  );

  registry.registerRecord(
    createRecord(
      "knowledge-unrelated",
      sourceA.id,
      "Marketplace payment processing requirements",
    ),
  );

  registry.registerRecord(
    createRecord(
      "knowledge-non-authoritative",
      sourceC.id,
      "Collector Profile authentication requirements",
      "semantic",
      false,
    ),
  );

  registry.registerRecord(
    createRecord(
      "knowledge-procedural",
      sourceB.id,
      "Collector Profile deployment procedure",
      "procedural",
    ),
  );

  return registry;
}

function main(): void {
  const registry =
    buildRegistry();

  const retrieval =
    new KnowledgeRetrieval(
      registry,
    );

  const exact =
    retrieval.retrieve({
      query:
        "Collector Profile authentication requirements",
      authoritativeOnly: true,
      limit: 5,
    });

  assert(
    exact.records.length >= 1,
    "Relevant retrieval returned no records.",
  );

  assert(
    exact.records[0].id ===
      "knowledge-exact",
    "Exact/highest-relevance knowledge was not ranked first.",
  );

  console.log(
    "05.2 relevance ranking: SUCCESS",
  );

  const unrelated =
    retrieval.retrieve({
      query:
        "Collector Profile authentication",
      authoritativeOnly: true,
      limit: 10,
    });

  assert(
    unrelated.records.some(
      (record) =>
        record.id ===
        "knowledge-unrelated",
    ) === false,
    "Unrelated knowledge entered retrieval results.",
  );

  console.log(
    "05.2 unrelated knowledge exclusion: SUCCESS",
  );

  const authoritative =
    retrieval.retrieve({
      query:
        "Collector Profile authentication requirements",
      authoritativeOnly: true,
      limit: 10,
    });

  assert(
    authoritative.records.some(
      (record) =>
        record.id ===
        "knowledge-non-authoritative",
    ) === false,
    "Non-authoritative knowledge bypassed authoritative-only retrieval.",
  );

  console.log(
    "05.2 authoritative-only boundary: SUCCESS",
  );

  const sourceFiltered =
    retrieval.retrieve({
      query:
        "Collector authentication requirements",
      sourceIds: [
        "source-retrieval-b",
      ],
      authoritativeOnly: true,
      limit: 10,
    });

  assert(
    sourceFiltered.records.every(
      (record) =>
        record.sourceId ===
        "source-retrieval-b",
    ),
    "Source filtering leaked records from another source.",
  );

  console.log(
    "05.2 source boundary: SUCCESS",
  );

  const typeFiltered =
    retrieval.retrieve({
      query:
        "Collector Profile deployment procedure",
      memoryTypes: [
        "procedural",
      ],
      authoritativeOnly: true,
      limit: 10,
    });

  assert(
    typeFiltered.records.length === 1 &&
    typeFiltered.records[0].id ===
      "knowledge-procedural",
    "Memory-type filtering failed.",
  );

  console.log(
    "05.2 memory-type boundary: SUCCESS",
  );

  const limited =
    retrieval.retrieve({
      query:
        "Collector",
      authoritativeOnly: true,
      limit: 1,
    });

  assert(
    limited.records.length === 1,
    "Result limit was not enforced.",
  );

  console.log(
    "05.2 result limit: SUCCESS",
  );

  const evidenceBound =
    retrieval.retrieve({
      query:
        "Collector Profile authentication requirements",
      authoritativeOnly: true,
      limit: 1,
    });

  const selectedIds =
    new Set(
      evidenceBound.records.flatMap(
        (record) =>
          record.evidenceIds,
      ),
    );

  assert(
    evidenceBound.evidence.every(
      (evidence) =>
        selectedIds.has(
          evidence.id,
        ),
    ),
    "Evidence was returned for records outside the selected result set.",
  );

  console.log(
    "05.2 evidence-result boundary: SUCCESS",
  );

  const provenanceIds =
    new Set(
      evidenceBound.records.map(
        (record) =>
          record.sourceId,
      ),
    );

  assert(
    evidenceBound.sourceIds.every(
      (sourceId) =>
        provenanceIds.has(
          sourceId,
        ),
    ),
    "Result source provenance does not match selected records.",
  );

  console.log(
    "05.2 source provenance: SUCCESS",
  );

  const repeatedA =
    retrieval.retrieve({
      query:
        "Collector Profile authentication requirements",
      authoritativeOnly: true,
      limit: 10,
    });

  const repeatedB =
    retrieval.retrieve({
      query:
        "Collector Profile authentication requirements",
      authoritativeOnly: true,
      limit: 10,
    });

  assert(
    repeatedA.records.map(
      (record) =>
        record.id,
    ).join("|") ===
      repeatedB.records.map(
        (record) =>
          record.id,
      ).join("|"),
    "Equivalent retrievals did not produce deterministic record ordering.",
  );

  assert(
    repeatedA.evidence.map(
      (item) =>
        item.id,
    ).join("|") ===
      repeatedB.evidence.map(
        (item) =>
          item.id,
      ).join("|"),
    "Equivalent retrievals did not produce deterministic evidence ordering.",
  );

  assert(
    repeatedA.sourceIds.join("|") ===
      repeatedB.sourceIds.join("|"),
    "Equivalent retrievals did not produce deterministic source ordering.",
  );

  console.log(
    "05.2 repeated-query determinism: SUCCESS",
  );

  const normalizedA =
    retrieval.retrieve({
      query:
        "Collector Profile!",
      authoritativeOnly: true,
      limit: 10,
    });

  const normalizedB =
    retrieval.retrieve({
      query:
        "collector profile",
      authoritativeOnly: true,
      limit: 10,
    });

  assert(
    normalizedA.records.map(
      (record) =>
        record.id,
    ).join("|") ===
      normalizedB.records.map(
        (record) =>
          record.id,
      ).join("|"),
    "Query normalization produced different retrieval results.",
  );

  console.log(
    "05.2 query normalization stability: SUCCESS",
  );

  const empty =
    retrieval.retrieve({
      query: "   ",
      authoritativeOnly: true,
      limit: 10,
    });

  assert(
    empty.records.length === 0,
    "Whitespace-only query returned knowledge.",
  );

  assert(
    empty.evidence.length === 0,
    "Whitespace-only query returned evidence.",
  );

  assert(
    empty.sourceIds.length === 0,
    "Whitespace-only query returned source provenance.",
  );

  console.log(
    "05.2 empty-query safety: SUCCESS",
  );

  const zeroLimit =
    retrieval.retrieve({
      query:
        "Collector",
      authoritativeOnly: true,
      limit: 0,
    });

  assert(
    zeroLimit.records.length === 0,
    "Explicit zero result limit was not respected.",
  );

  console.log(
    "05.2 explicit zero-limit safety: SUCCESS",
  );

  console.log(
    "TREE-05.2 KNOWLEDGE RETRIEVAL INTEGRITY: SUCCESS",
  );
}

main();
