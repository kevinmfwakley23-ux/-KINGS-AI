import type {
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
  Mission,
  MemoryQuery,
} from "./types";

import {
  ProjectBrain,
} from "./project-brain";

import {
  ProjectBrainStateAuthority,
} from "./project-brain-state";

import {
  MissionContinuityStore,
} from "./mission-continuity";

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
  const now =
    new Date().toISOString();

  const mission: Mission = {
    id:
      "MISSION-015-TEST",
    name:
      "Project Brain State Test",
    description:
      "Verifies the Project Brain state authority.",
    status:
      "active",
    objectives: [
      "Verify mission state.",
      "Verify authoritative knowledge.",
    ],
    sourceReferences: [
      "test/mission-015",
    ],
    createdAt:
      now,
    updatedAt:
      now,
  };

  const continuity =
    new MissionContinuityStore();

  continuity.registerMission(
    mission,
  );

  continuity.registerPlan({
    id:
      "PLAN-015-TEST",
    missionId:
      mission.id,
    version: 1,
    objective:
      "Verify Project Brain state assembly.",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: [
      "Project Brain state snapshot is assembled.",
    ],
    locked: false,
    approvedByHuman: false,
    createdAt:
      now,
    updatedAt:
      now,
  });

  continuity.updateState(
    mission.id,
    {
      activeTaskIds: [
        "TASK-015-TEST",
      ],
    },
  );

  continuity.registerDecision({
    id:
      "DECISION-015-TEST",
    missionId:
      mission.id,
    statement:
      "Project Brain state must remain read-only during retrieval.",
    rationale:
      "Execution context must not mutate project authority.",
    authoritative:
      true,
    locked:
      true,
    sourceReferences: [
      "test/decision-015",
    ],
    createdAt:
      now,
    updatedAt:
      now,
  });

  const brain =
    new ProjectBrain();

  const source: KnowledgeSource = {
    id:
      "SOURCE-015-TEST",
    type:
      "decision",
    name:
      "Project Brain State Test Source",
    description:
      "Authoritative test source.",
    location:
      "test/project-brain-state.md",
    authoritative:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };

  const evidence: Evidence = {
    id:
      "EVIDENCE-015-TEST",
    sourceId:
      source.id,
    description:
      "Evidence supporting Project Brain state authority.",
    location:
      "test/project-brain-state.md",
    excerpt:
      "Project Brain state is assembled from authoritative sources.",
    createdAt:
      now,
  };

  const record: KnowledgeRecord = {
    id:
      "KNOWLEDGE-015-TEST",
    sourceId:
      source.id,
    memoryType:
      "semantic",
    summary:
      "Project Brain state is assembled from authoritative sources.",
    content:
      "The Project Brain state authority provides read-only project knowledge for mission execution.",
    evidenceIds: [
      evidence.id,
    ],
    authoritative:
      true,
    createdAt:
      now,
    updatedAt:
      now,
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

  const authority =
    new ProjectBrainStateAuthority(
      brain,
      continuity,
    );

  const query: MemoryQuery = {
    query:
      "Project Brain state authoritative sources",
    authoritativeOnly:
      false,
    limit:
      10,
  };

  const snapshot =
    authority.snapshot({
      missionId:
        mission.id,
      knowledgeQuery:
        query,
    });

  assert(
    snapshot.missionId ===
      mission.id,
    "Mission identity must be preserved.",
  );

  assert(
    snapshot.continuity.mission.id ===
      mission.id,
    "Mission continuity must be included.",
  );

  assert(
    snapshot.continuity.plan.id ===
      "PLAN-015-TEST",
    "Current mission plan must be included.",
  );

  assert(
    snapshot.continuity.state.activeTaskIds.includes(
      "TASK-015-TEST",
    ),
    "Current mission state must be included.",
  );

  assert(
    snapshot.continuity.decisions.length ===
      1,
    "Mission decisions must be included.",
  );

  assert(
    snapshot.knowledge.records.length ===
      1,
    "Project Brain knowledge must be retrieved.",
  );

  assert(
    snapshot.authoritativeRecords.length ===
      1,
    "Only authoritative knowledge records may enter the authoritative state view.",
  );

  assert(
    snapshot.authoritativeRecords[0].id ===
      record.id,
    "Expected authoritative knowledge record must be preserved.",
  );

  assert(
    snapshot.knowledge.evidence.length ===
      1,
    "Knowledge evidence provenance must be preserved.",
  );

  assert(
    snapshot.knowledge.sourceIds.length ===
      1,
    "Knowledge source provenance must be preserved.",
  );

  console.log(
    "Mission continuity state assembly: SUCCESS",
  );

  console.log(
    "Current mission plan inclusion: SUCCESS",
  );

  console.log(
    "Mission decision inclusion: SUCCESS",
  );

  console.log(
    "Authoritative Project Brain retrieval: SUCCESS",
  );

  console.log(
    "Project Brain evidence provenance: SUCCESS",
  );

  console.log(
    "Project Brain source provenance: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-015 Project Brain state authority: SUCCESS",
  );
}

main();
