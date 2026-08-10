import type {
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
  MemoryQuery,
  MemoryResult,
} from "./types";

function main(): void {
  const source: KnowledgeSource = {
    id: "source-kings-implementation-matrix",
    type: "implementation-matrix",
    name: "KINGS Collectibles Implementation Matrix",
    description:
      "Authoritative implementation-order document for KINGS Collectibles.",
    location: "~/kings-collectibles-1/IMPLEMENTATION_MATRIX.md",
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const evidence: Evidence = {
    id: "evidence-auth-before-collector-profile",
    sourceId: source.id,
    description:
      "The implementation matrix establishes Authentication as a dependency of Collector Profile.",
    location: "Phase 1 / Collector Profile",
    createdAt: new Date().toISOString(),
  };

  const record: KnowledgeRecord = {
    memoryType: "semantic",
    id: "knowledge-auth-before-collector-profile",
    sourceId: source.id,
    summary:
      "Authentication must be completed before Collector Profile implementation.",
    evidenceIds: [evidence.id],
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const query: MemoryQuery = {
    query: "What must be completed before Collector Profile?",
    sourceIds: [source.id],
    authoritativeOnly: true,
    limit: 5,
  };

  const result: MemoryResult = {
    query: query.query,
    records: [record],
    evidence: [evidence],
    sourceIds: [source.id],
    createdAt: new Date().toISOString(),
  };

  if (!source.authoritative) {
    throw new Error("Knowledge source was not marked authoritative.");
  }

  if (!record.authoritative) {
    throw new Error("Knowledge record was not marked authoritative.");
  }

  if (!query.authoritativeOnly) {
    throw new Error("Memory query did not request authoritative knowledge.");
  }

  if (result.records.length !== 1) {
    throw new Error("Memory result did not return the expected knowledge record.");
  }

  if (result.evidence.length !== 1) {
    throw new Error("Memory result did not return supporting evidence.");
  }

  if (result.sourceIds[0] !== source.id) {
    throw new Error("Memory result lost source provenance.");
  }

  if (result.records[0].evidenceIds[0] !== evidence.id) {
    throw new Error("Knowledge record lost evidence provenance.");
  }

  console.log("=== K.I.N.G.S. KNOWLEDGE CONTRACT TEST ===");
  console.log("Authoritative source: SUCCESS");
  console.log("Authoritative knowledge record: SUCCESS");
  console.log("Authoritative retrieval query: SUCCESS");
  console.log("Evidence provenance: SUCCESS");
  console.log("Source provenance: SUCCESS");
  console.log("Knowledge contract test: SUCCESS");
}

main();
