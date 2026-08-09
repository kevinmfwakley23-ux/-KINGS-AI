import type {
  KnowledgeRecord,
  KnowledgeSource,
} from "./types";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

function main(): void {
  const registry = new KnowledgeRegistry();

  const source: KnowledgeSource = {
    id: "source-kings-test",
    type: "implementation-matrix",
    name: "KINGS Collectibles Implementation Matrix",
    description:
      "Test representation of an authoritative KINGS Collectibles source.",
    location: "~/kings-collectibles-1/IMPLEMENTATION_MATRIX.md",
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const record: KnowledgeRecord = {
    id: "knowledge-kings-test",
    sourceId: source.id,
    summary:
      "Authentication precedes Collector Profile implementation.",
    evidenceIds: [],
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  registry.registerSource(source);
  registry.registerRecord(record);

  if (registry.getSource(source.id) !== source) {
    throw new Error("Registered source could not be retrieved.");
  }

  if (registry.getRecord(record.id) !== record) {
    throw new Error("Registered record could not be retrieved.");
  }

  if (registry.listSources().length !== 1) {
    throw new Error("Unexpected registered source count.");
  }

  if (registry.listRecords().length !== 1) {
    throw new Error("Unexpected registered record count.");
  }

  let orphanRejected = false;

  try {
    registry.registerRecord({
      ...record,
      id: "knowledge-orphan-test",
      sourceId: "source-missing",
    });
  } catch (error) {
    orphanRejected =
      error instanceof Error &&
      error.message.includes("must be registered");
  }

  if (!orphanRejected) {
    throw new Error(
      "Knowledge record without a registered source was not rejected.",
    );
  }

  let duplicateSourceRejected = false;

  try {
    registry.registerSource(source);
  } catch (error) {
    duplicateSourceRejected =
      error instanceof Error &&
      error.message.includes("duplicate knowledge source");
  }

  if (!duplicateSourceRejected) {
    throw new Error("Duplicate knowledge source was not rejected.");
  }

  let duplicateRecordRejected = false;

  try {
    registry.registerRecord(record);
  } catch (error) {
    duplicateRecordRejected =
      error instanceof Error &&
      error.message.includes("duplicate knowledge record");
  }

  if (!duplicateRecordRejected) {
    throw new Error("Duplicate knowledge record was not rejected.");
  }

  console.log("=== K.I.N.G.S. KNOWLEDGE REGISTRY TEST ===");
  console.log("Source registration: SUCCESS");
  console.log("Knowledge record registration: SUCCESS");
  console.log("Source lookup: SUCCESS");
  console.log("Record lookup: SUCCESS");
  console.log("Orphan record rejected: SUCCESS");
  console.log("Duplicate source rejected: SUCCESS");
  console.log("Duplicate record rejected: SUCCESS");
  console.log("Knowledge registry test: SUCCESS");
}

main();
