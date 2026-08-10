import type {
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
} from "./types";

import {
  ProjectBrain,
} from "./project-brain";

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

function main(): void {
  const brain =
    new ProjectBrain();

  const source: KnowledgeSource = {
    id: "source-project-brain-test",
    type: "construction-document",
    name: "Project Brain Test Source",
    description:
      "Controlled source used to verify the Project Brain boundary.",
    location:
      "test/project-brain/source.md",
    authoritative: true,
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const evidence: Evidence = {
    id: "evidence-project-brain-test",
    sourceId: source.id,
    description:
      "Evidence establishing the Project Brain test fact.",
    location:
      "test/project-brain/source.md",
    excerpt:
      "Project Brain preserves authoritative project knowledge.",
    createdAt:
      new Date().toISOString(),
  };

  const record: KnowledgeRecord = {
    id: "knowledge-project-brain-test",
    sourceId: source.id,
    memoryType: "semantic",
    summary:
      "Project Brain preserves authoritative project knowledge.",
    content:
      "The Project Brain provides the K.I.N.G.S.-owned boundary for project knowledge retrieval.",
    evidenceIds: [
      evidence.id,
    ],
    authoritative: true,
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  brain.registerSource(
    source,
  );

  brain.registerEvidence(
    evidence,
  );

  brain.registerRecord(
    record,
  );

  assert(
    brain.getSource(
      source.id,
    ) === source,
    "Project Brain should expose registered sources.",
  );

  assert(
    brain.getEvidence(
      evidence.id,
    ) === evidence,
    "Project Brain should expose registered evidence.",
  );

  assert(
    brain.getRecord(
      record.id,
    ) === record,
    "Project Brain should expose registered records.",
  );

  const result =
    brain.retrieve({
      query:
        "Project Brain authoritative project knowledge",
      authoritativeOnly:
        true,
      limit: 5,
    });

  assert(
    result.records.length === 1,
    "Project Brain should retrieve the registered knowledge record.",
  );

  assert(
    result.records[0].id ===
      record.id,
    "Project Brain should return the expected knowledge record.",
  );

  assert(
    result.evidence.length === 1,
    "Project Brain should preserve evidence provenance.",
  );

  assert(
    result.evidence[0].id ===
      evidence.id,
    "Project Brain should return the supporting evidence.",
  );

  assert(
    result.sourceIds.length === 1 &&
      result.sourceIds[0] ===
        source.id,
    "Project Brain should preserve source provenance.",
  );

  assert(
    brain.listSources().length === 1,
    "Project Brain source listing should be complete.",
  );

  assert(
    brain.listEvidence().length === 1,
    "Project Brain evidence listing should be complete.",
  );

  assert(
    brain.listRecords().length === 1,
    "Project Brain record listing should be complete.",
  );

  console.log(
    "Project Brain source registration: SUCCESS",
  );

  console.log(
    "Project Brain evidence registration: SUCCESS",
  );

  console.log(
    "Project Brain knowledge registration: SUCCESS",
  );

  console.log(
    "Project Brain retrieval: SUCCESS",
  );

  console.log(
    "Project Brain evidence provenance: SUCCESS",
  );

  console.log(
    "Project Brain source provenance: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-001 Project Brain boundary: SUCCESS",
  );
}

main();
