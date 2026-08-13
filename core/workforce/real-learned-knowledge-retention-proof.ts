import {
  MemoryStore,
} from "./memory-store";

import {
  MemoryPromotionGate,
} from "./memory-promotion-gate";

import {
  MissionMemoryBridge,
} from "./mission-memory-bridge";

import {
  ProjectBrain,
} from "./project-brain";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

import type {
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
  MemoryReference,
} from "./types";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const memoryStore =
    new MemoryStore();

  const promotionGate =
    new MemoryPromotionGate();

  const missionMemory =
    new MissionMemoryBridge(
      memoryStore,
      promotionGate,
    );

  const knowledgeRegistry =
    new KnowledgeRegistry();

  const projectBrain =
    new ProjectBrain(
      knowledgeRegistry,
    );

  const source:
    KnowledgeSource = {
    id:
      "source-learned-typescript-proof",
    type:
      "repository",
    name:
      "K.I.N.G.S. Verified Engineering Learning",
    description:
      "Verified engineering learning source used to prove governed retention and reuse.",
    location:
      "proof://kings/typescript-learning",
    authoritative:
      false,
    createdAt:
      "2026-08-13T05:00:00.000Z",
    updatedAt:
      "2026-08-13T05:00:00.000Z",
  };

  projectBrain.registerSource(
    source,
  );

  const evidence:
    Evidence = {
    id:
      "evidence-learned-typescript-proof",
    sourceId:
      source.id,
    description:
      "TypeScript strict-mode verification established the learned rule.",
    location:
      "proof://kings/typescript-learning#strict-return-types",
    excerpt:
      "Public generated TypeScript functions should use explicit return types.",
    createdAt:
      "2026-08-13T05:00:00.000Z",
  };

  projectBrain.registerEvidence(
    evidence,
  );

  const knowledge:
    KnowledgeRecord = {
    id:
      "knowledge-learned-typescript-rule",
    sourceId:
      source.id,
    memoryType:
      "semantic",
    summary:
      "Public generated TypeScript functions should use explicit return types.",
    content:
      "Use explicit return types for public functions when generating maintainable TypeScript code.",
    evidenceIds: [
      evidence.id,
    ],
    authoritative:
      false,
    createdAt:
      "2026-08-13T05:00:00.000Z",
    updatedAt:
      "2026-08-13T05:00:00.000Z",
  };

  projectBrain.registerRecord(
    knowledge,
  );

  const initialKnowledge =
    projectBrain.retrieve({
      query:
        "explicit return types public TypeScript functions",
      authoritativeOnly:
        false,
      limit:
        5,
    });

  assert(
    initialKnowledge.records.some(
      (
        record,
      ) =>
        record.id ===
        knowledge.id,
    ),
    "Learned knowledge must be retrievable immediately after registration.",
  );

  assert(
    initialKnowledge.evidence.some(
      (
        item,
      ) =>
        item.id ===
        evidence.id,
    ),
    "Initial retrieval must retain supporting evidence.",
  );

  console.log(
    "05.LEARN knowledge registration and retrieval: SUCCESS",
  );

  const learnedMemory:
    MemoryReference = {
    id:
      "learned-memory-typescript-rule",
    type:
      "semantic",
    summary:
      knowledge.summary,
    sourceReferences: [
      evidence.id,
    ],
    authoritative:
      false,
    createdAt:
      "2026-08-13T05:00:00.000Z",
    updatedAt:
      "2026-08-13T05:00:00.000Z",
  };

  memoryStore.register(
    learnedMemory,
  );

  const promotion =
    promotionGate.evaluate({
      memory:
        learnedMemory,
      verificationReferences: [
        evidence.id,
      ],
      humanAccepted:
        false,
    });

  assert(
    promotion.allowed,
    "Verified learned knowledge must be eligible for durable promotion.",
  );

  const promoted =
    memoryStore.promote(
      learnedMemory.id,
    );

  assert(
    promoted.authoritative,
    "Promoted learned memory must become authoritative.",
  );

  assert(
    promoted.sourceReferences.includes(
      evidence.id,
    ),
    "Promoted learned memory must preserve provenance.",
  );

  console.log(
    "05.LEARN verification-gated durable promotion: SUCCESS",
  );

  const missionRegistration =
    missionMemory.rememberState(
      {
        missionId:
          "mission-knowledge-proof",
        activeTaskIds: [
          "task-reuse",
        ],
        completedTaskIds: [],
        blockedTaskIds: [],
        failedTaskIds: [],
        openQuestionIds: [],
        riskIds: [],
        artifactIds: [],
        evidenceIds: [
          evidence.id,
        ],
        updatedAt:
          "2026-08-13T05:00:01.000Z",
      },
      {
        sourceReferences: [
          evidence.id,
        ],
      },
      "episodic",
    );

  assert(
    missionRegistration.missionId ===
      "mission-knowledge-proof",
    "Mission memory must preserve mission identity.",
  );

  console.log(
    "05.LEARN mission-memory integration: SUCCESS",
  );

  const durableLearned =
    memoryStore.get(
      learnedMemory.id,
    );

  assert(
    durableLearned !==
      undefined,
    "Promoted learned knowledge must remain stored.",
  );

  assert(
    durableLearned!.authoritative,
    "Retained learned knowledge must remain authoritative.",
  );

  assert(
    durableLearned!.sourceReferences.includes(
      evidence.id,
    ),
    "Retained learned knowledge must preserve provenance.",
  );

  console.log(
    "05.LEARN durable memory retention: SUCCESS",
  );

  const laterLearnedQuery =
    memoryStore.query({
      type:
        "semantic",
      authoritativeOnly:
        true,
      limit:
        10,
    });

  const reused =
    laterLearnedQuery.find(
      (
        memory,
      ) =>
        memory.id ===
        learnedMemory.id,
    );

  assert(
    reused !==
      undefined,
    "A later task must retrieve the retained semantic learned memory.",
  );

  assert(
    reused!.summary.includes(
      "explicit return types",
    ),
    "Later reuse must receive the learned rule itself.",
  );

  assert(
    reused!.sourceReferences.includes(
      evidence.id,
    ),
    "Later reuse must preserve the original verification provenance.",
  );

  console.log(
    "05.LEARN later-task knowledge reuse: SUCCESS",
  );

  const laterMissionMemory =
    memoryStore.query({
      type:
        "episodic",
      missionId:
        "mission-knowledge-proof",
      limit:
        10,
    });

  assert(
    laterMissionMemory.some(
      (
        memory,
      ) =>
        memory.id ===
        missionRegistration.memoryId,
    ),
    "Mission-scoped episodic memory must remain retrievable separately from learned semantic memory.",
  );

  console.log(
    "05.LEARN mission-memory retrieval: SUCCESS",
  );

  const unverifiedMemory:
    MemoryReference = {
    id:
      "learned-memory-unverified",
    type:
      "semantic",
    summary:
      "Unverified engineering claim.",
    sourceReferences: [],
    authoritative:
      false,
    createdAt:
      "2026-08-13T05:00:00.000Z",
    updatedAt:
      "2026-08-13T05:00:00.000Z",
  };

  const deniedPromotion =
    promotionGate.evaluate({
      memory:
        unverifiedMemory,
      verificationReferences: [],
      humanAccepted:
        false,
    });

  assert(
    !deniedPromotion.allowed,
    "Unverified learned claims must not be promoted.",
  );

  console.log(
    "05.LEARN unverified promotion protection: SUCCESS",
  );

  console.log(
    "TREE-05 LEARN → VERIFY → PROMOTE → RETAIN → REUSE: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
