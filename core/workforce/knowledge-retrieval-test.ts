import type {
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
} from "./types";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

import {
  KnowledgeRetrieval,
} from "./knowledge-retrieval";

function main(): void {
  const registry = new KnowledgeRegistry();

  const matrixSource: KnowledgeSource = {
    id: "source-implementation-matrix-test",
    type: "implementation-matrix",
    name: "KINGS Collectibles Implementation Matrix",
    description: "Test implementation dependency source.",
    location: "~/kings-collectibles-1/IMPLEMENTATION_MATRIX.md",
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const architectureSource: KnowledgeSource = {
    id: "source-architecture-test",
    type: "construction-document",
    name: "KINGS Collectibles Architecture",
    description: "Test architecture source.",
    location: "~/kings-collectibles-1/architecture/",
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const matrixEvidence: Evidence = {
    id: "evidence-collector-dependency",
    sourceId: matrixSource.id,
    description:
      "Authentication is a dependency of Collector Profile.",
    location: "Phase 1 / Collector Profile",
    createdAt: new Date().toISOString(),
  };

  const architectureEvidence: Evidence = {
    id: "evidence-collector-model",
    sourceId: architectureSource.id,
    description:
      "Collector Profile defines the collector domain model.",
    location: "Collector domain architecture",
    createdAt: new Date().toISOString(),
  };

  registry.registerSource(matrixSource);
  registry.registerSource(architectureSource);

  registry.registerEvidence(matrixEvidence);
  registry.registerEvidence(architectureEvidence);

  const dependencyRecord: KnowledgeRecord = {
    id: "knowledge-auth-dependency",
    sourceId: matrixSource.id,
    memoryType: "semantic",
    summary:
      "Authentication must be completed before Collector Profile implementation.",
    evidenceIds: [matrixEvidence.id],
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const modelRecord: KnowledgeRecord = {
    id: "knowledge-collector-model",
    sourceId: architectureSource.id,
    memoryType: "semantic",
    summary:
      "Collector Profile defines the collector domain model and identity requirements.",
    evidenceIds: [architectureEvidence.id],
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const unrelatedRecord: KnowledgeRecord = {
    id: "knowledge-marketplace-test",
    sourceId: architectureSource.id,
    memoryType: "procedural",
    summary:
      "Marketplace depends on payment and collector services.",
    evidenceIds: [],
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  registry.registerRecord(dependencyRecord);
  registry.registerRecord(modelRecord);
  registry.registerRecord(unrelatedRecord);

  const retrieval = new KnowledgeRetrieval(registry);

  const basicResult = retrieval.retrieve({
    query: "Collector Profile",
    authoritativeOnly: true,
    limit: 5,
  });

  if (basicResult.records.length !== 2) {
    throw new Error(
      `Expected 2 Collector Profile records, got ${basicResult.records.length}`,
    );
  }

  if (
    !basicResult.records.some(
      (record) => record.id === dependencyRecord.id,
    )
  ) {
    throw new Error(
      "Dependency record was not retrieved.",
    );
  }

  if (
    !basicResult.records.some(
      (record) => record.id === modelRecord.id,
    )
  ) {
    throw new Error(
      "Collector model record was not retrieved.",
    );
  }

  if (basicResult.evidence.length !== 2) {
    throw new Error(
      `Expected 2 evidence records, got ${basicResult.evidence.length}`,
    );
  }

  const naturalLanguageResult = retrieval.retrieve({
    query: "Collector Profile?",
    authoritativeOnly: true,
    limit: 5,
  });

  if (naturalLanguageResult.records.length !== 2) {
    throw new Error(
      "Natural-language punctuation normalization failed.",
    );
  }

  console.log("Natural-language query normalization: SUCCESS");

  const sourceFilteredResult = retrieval.retrieve({
    query: "Collector Profile",
    sourceIds: [matrixSource.id],
    authoritativeOnly: true,
    limit: 5,
  });

  if (sourceFilteredResult.records.length !== 1) {
    throw new Error(
      "Source filtering did not restrict retrieval correctly.",
    );
  }

  if (
    sourceFilteredResult.records[0].id !== dependencyRecord.id
  ) {
    throw new Error(
      "Source filtering returned the wrong record.",
    );
  }

  const memoryTypeFilteredResult = retrieval.retrieve({
    query: "Collector Profile",
    memoryTypes: ["procedural"],
    authoritativeOnly: true,
    limit: 5,
  });

  if (memoryTypeFilteredResult.records.length !== 0) {
    throw new Error(
      "Memory type filtering returned an unexpected record.",
    );
  }

  const limitedResult = retrieval.retrieve({
    query: "Collector",
    authoritativeOnly: true,
    limit: 1,
  });

  if (limitedResult.records.length !== 1) {
    throw new Error(
      "Retrieval limit was not enforced.",
    );
  }

  if (limitedResult.sourceIds.length !== 1) {
    throw new Error(
      "Limited result did not preserve source provenance.",
    );
  }

  console.log("=== K.I.N.G.S. KNOWLEDGE RETRIEVAL TEST ===");
  console.log("Relevant knowledge retrieved: SUCCESS");
  console.log("Evidence returned: SUCCESS");
  console.log("Source filtering: SUCCESS");
  console.log("Memory type filtering: SUCCESS");
  console.log("Result limit enforced: SUCCESS");
  console.log("Source provenance preserved: SUCCESS");
  console.log("Knowledge retrieval test: SUCCESS");
}

main();

function runNegativeRetrievalChecks(): void {
  const registry = new KnowledgeRegistry();

  const source: KnowledgeSource = {
    id: "source-negative-test",
    type: "construction-document",
    name: "Negative Retrieval Test Source",
    description: "Test source for retrieval exclusion behavior.",
    location: "~/kings-collectibles-1/test-source.md",
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  registry.registerSource(source);

  const evidence: Evidence = {
    id: "evidence-negative-test",
    sourceId: source.id,
    description: "Negative retrieval test evidence.",
    location: "test",
    createdAt: new Date().toISOString(),
  };

  registry.registerEvidence(evidence);

  registry.registerRecord({
    id: "knowledge-authoritative-negative",
    sourceId: source.id,
    memoryType: "semantic",
    summary: "Authentication controls collector identity.",
    evidenceIds: [evidence.id],
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  registry.registerRecord({
    id: "knowledge-non-authoritative-negative",
    sourceId: source.id,
    memoryType: "semantic",
    summary: "Authentication controls collector identity.",
    evidenceIds: [],
    authoritative: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const retrieval = new KnowledgeRetrieval(registry);

  const noMatch = retrieval.retrieve({
    query: "Marketplace Treasury",
    authoritativeOnly: true,
    limit: 5,
  });

  if (noMatch.records.length !== 0) {
    throw new Error("Unrelated query returned knowledge.");
  }

  const authoritativeOnly = retrieval.retrieve({
    query: "Authentication collector identity",
    authoritativeOnly: true,
    limit: 5,
  });

  if (authoritativeOnly.records.length !== 1) {
    throw new Error(
      "Authoritative-only retrieval returned non-authoritative knowledge.",
    );
  }

  if (
    authoritativeOnly.records[0].id !==
    "knowledge-authoritative-negative"
  ) {
    throw new Error(
      "Authoritative-only retrieval returned the wrong record.",
    );
  }

  console.log("No-match query exclusion: SUCCESS");
  console.log("Non-authoritative exclusion: SUCCESS");
  console.log("Negative retrieval checks: SUCCESS");
}

runNegativeRetrievalChecks();
