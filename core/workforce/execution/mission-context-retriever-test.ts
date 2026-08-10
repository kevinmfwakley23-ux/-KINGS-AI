import {
  MemoryStore,
} from "../memory-store";

import {
  MemoryPromotionGate,
} from "../memory-promotion-gate";

import {
  MissionMemoryBridge,
} from "../mission-memory-bridge";

import {
  MissionContextRetriever,
} from "./mission-context-retriever";

import type {
  MemoryType,
  Task,
} from "../types";

async function main(): Promise<void> {
  const now =
    new Date().toISOString();

  const store =
    new MemoryStore();

  const gate =
    new MemoryPromotionGate();

  const bridge =
    new MissionMemoryBridge(
      store,
      gate,
    );

  const type =
    "semantic" as MemoryType;

  bridge.rememberState(
    {
      missionId:
        "MISSION-010",
      activeTaskIds: [
        "TASK-010",
      ],
      completedTaskIds: [],
      blockedTaskIds: [],
      failedTaskIds: [],
      openQuestionIds: [],
      riskIds: [],
      artifactIds: [],
      evidenceIds: [
        "EVIDENCE-010",
      ],
      updatedAt: now,
    },
    {
      sourceReferences: [
        "mission-context",
      ],
    },
    type,
  );

  bridge.rememberDecision(
    {
      id:
        "DECISION-010",
      missionId:
        "MISSION-010",
      statement:
        "Use the locked mission architecture.",
      rationale:
        "The approved architecture is authoritative.",
      authoritative: true,
      locked: true,
      sourceReferences: [
        "mission-context",
      ],
      createdAt: now,
      updatedAt: now,
    },
    type,
  );

  const retriever =
    new MissionContextRetriever(
      bridge,
    );

  const task: Task = {
    id:
      "TASK-010",
    missionId:
      "MISSION-010",
    name:
      "Context retrieval test",
    description:
      "Validate mission-scoped context retrieval.",
    requiredCapabilities: [],
    requiredToolIds: [],
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [
      "mission-context",
    ],
    expectedOutputs: [
      "retrieved context",
    ],
    createdAt: now,
    updatedAt: now,
  };

  const context =
    await retriever.retrieve(
      task,
    );

  if (
    context.missionId !==
    task.missionId
  ) {
    throw new Error(
      "Mission scope was not preserved",
    );
  }

  if (
    context.taskId !== task.id
  ) {
    throw new Error(
      "Task scope was not preserved",
    );
  }

  if (
    context.memories.length !== 2
  ) {
    throw new Error(
      "Mission memory retrieval count is incorrect",
    );
  }

  if (
    !context.memories[0].authoritative
  ) {
    throw new Error(
      "Authoritative mission memory was not prioritized",
    );
  }

  console.log(
    "Mission-scoped memory retrieval: SUCCESS",
  );

  const limitedRetriever =
    new MissionContextRetriever(
      bridge,
      undefined,
      {
        maxMemories: 1,
        maxKnowledgeRecords: 1,
        maxEvidence: 1,
      },
    );

  const limited =
    await limitedRetriever.retrieve(
      task,
    );

  if (
    limited.memories.length !== 1
  ) {
    throw new Error(
      "Mission memory limit was not enforced",
    );
  }

  console.log(
    "Mission memory budget enforcement: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-010 mission context retrieval: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    throw error;
  },
);
