import type {
  AgentDefinition,
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
  MemoryReference,
  Task,
} from "../types";

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
  KnowledgeRegistry,
} from "../knowledge-registry";

import {
  ProjectBrain,
} from "../project-brain";

import type {
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import {
  MissionContextRetriever,
} from "./mission-context-retriever";

import {
  GovernedMemoryExecutionPipeline,
} from "../memory-governed-execution-pipeline";

import {
  ExecutionContextBuilder,
} from "./context-builder";

function assert(
  condition:
    boolean,

  message:
    string,
):
  void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

class BrainAdapter
  implements KnowledgeRuntimeAdapter {
  constructor(
    private readonly brain:
      ProjectBrain,
  ) {}

  async retrieve(
    query:
      Parameters<
        ProjectBrain["retrieve"]
      >[0],
  ) {
    return this.brain.retrieve(
      query,
    );
  }
}

function memory(
  id:
    string,

  summary:
    string,

  overrides:
    Partial<MemoryReference> =
      {},
):
  MemoryReference {
  return {
    id,

    type:
      "semantic",

    summary,

    sourceReferences:
      [
        "architecture",
      ],

    missionId:
      "mission-memory-integration-003",

    taskId:
      "task-memory-integration-003",

    authoritative:
      false,

    createdAt:
      "2026-08-13T00:00:00.000Z",

    updatedAt:
      "2026-08-13T01:00:00.000Z",

    ...overrides,
  };
}

async function main():
  Promise<void> {
  const memoryStore =
    new MemoryStore();

  const promotionGate =
    new MemoryPromotionGate();

  const missionMemory =
    new MissionMemoryBridge(
      memoryStore,
      promotionGate,
    );

  const registry =
    new KnowledgeRegistry();

  const brain =
    new ProjectBrain(
      registry,
    );

  const source:
    KnowledgeSource = {
    id:
      "source-memory-integration-003",

    type:
      "repository",

    name:
      "Normal Dispatch Memory Proof",

    description:
      "Authoritative source for normal workforce dispatch memory governance.",

    location:
      "proof://kings/memory-integration-003",

    authoritative:
      false,

    createdAt:
      "2026-08-13T00:00:00.000Z",

    updatedAt:
      "2026-08-13T00:00:00.000Z",
  };

  brain.registerSource(
    source,
  );

  const evidence:
    Evidence = {
    id:
      "evidence-memory-integration-003",

    sourceId:
      source.id,

    description:
      "Evidence that normal workforce dispatch must receive governed memory context.",

    location:
      "proof://kings/memory-integration-003#evidence",

    excerpt:
      "Normal workforce execution uses governed memory preparation.",

    createdAt:
      "2026-08-13T00:00:00.000Z",
  };

  brain.registerEvidence(
    evidence,
  );

  const knowledge:
    KnowledgeRecord = {
    id:
      "knowledge-memory-integration-003",

    sourceId:
      source.id,

    memoryType:
      "procedural",

    summary:
      "Normal workforce dispatch should receive governed memory context.",

    content:
      "The normal workforce execution path should construct governed memory context before invoking the worker adapter.",

    evidenceIds:
      [
        evidence.id,
      ],

    authoritative:
      true,

    createdAt:
      "2026-08-13T00:00:00.000Z",

    updatedAt:
      "2026-08-13T00:00:00.000Z",
  };

  brain.registerRecord(
    knowledge,
  );

  const currentTruth =
    memory(
      "memory-dispatch-current-truth",
      "Creator-approved normal worker dispatch uses governed memory context.",
      {
        authoritative:
          true,
      },
    );

  const obsolete =
    memory(
      "memory-dispatch-obsolete",
      "Old worker dispatch omitted governed memory context.",
      {
        updatedAt:
          "2026-07-01T00:00:00.000Z",
      },
    );

  memoryStore.register(
    currentTruth,
  );

  memoryStore.register(
    obsolete,
  );

  missionMemory.rememberState(
    {
      missionId:
        "mission-memory-integration-003",

      activeTaskIds:
        [
          "task-memory-integration-003",
        ],

      completedTaskIds:
        [],

      blockedTaskIds:
        [],

      failedTaskIds:
        [],

      openQuestionIds:
        [],

      riskIds:
        [],

      artifactIds:
        [],

      evidenceIds:
        [
          ...currentTruth.sourceReferences,
          ...obsolete.sourceReferences,
        ],

      updatedAt:
        "2026-08-13T01:00:00.000Z",
    },

    {
      sourceReferences:
        [
          ...currentTruth.sourceReferences,
          ...obsolete.sourceReferences,
        ],
    },

    "episodic",
  );

  const task:
    Task = {
    id:
      "task-memory-integration-003",

    missionId:
      "mission-memory-integration-003",

    name:
      "Normal governed worker dispatch",

    description:
      "Execute a normal workforce task using the creator-approved governed memory architecture.",

    requiredCapabilities:
      [
        "coding",
      ],

    requiredToolIds:
      [],

    status:
      "ready",

    dependencyIds:
      [],

    inputReferences:
      [
        "architecture",
      ],

    expectedOutputs:
      [
        "governed worker execution",
      ],

    knowledgeQuery: {
      query:
        "normal workforce dispatch governed memory context",

      authoritativeOnly:
        true,

      limit:
        5,
    },

    createdAt:
      "2026-08-13T01:00:00.000Z",

    updatedAt:
      "2026-08-13T01:00:00.000Z",
  };

  const agent:
    AgentDefinition = {
    id:
      "agent-memory-integration-003",

    name:
      "Normal Dispatch Worker",

    role:
      "engineering-worker",

    description:
      "Worker used to prove that normal workforce context construction uses governed memory.",

    capabilities:
      [
        "coding",
      ],

    toolIds:
      [],

    status:
      "available",
  };

  const retriever =
    new MissionContextRetriever(
      missionMemory,
      new BrainAdapter(
        brain,
      ),
      {
        maxMemories:
          20,

        maxKnowledgeRecords:
          20,

        maxEvidence:
          40,
      },
    );

  const pipeline =
    new GovernedMemoryExecutionPipeline(
      retriever,
    );

  const builder =
    new ExecutionContextBuilder(
      new BrainAdapter(
        brain,
      ),

      missionMemory,

      undefined,

      pipeline,
    );

  const context =
    await builder.build(
      agent,
      task,
      undefined,
      {
        now:
          "2026-08-13T02:00:00.000Z",

        memoryBudgetTokens:
          250,

        minimumRetrievalQuality:
          0.30,

        supersededMemoryIds:
          [
            obsolete.id,
          ],

        knownMissionIds:
          [
            task.missionId,
          ],

        knownTaskIds:
          [
            task.id,
          ],

        knownSourceIds:
          [
            currentTruth.sourceReferences[0],
            obsolete.sourceReferences[0],
          ],
      },
    );

  assert(
    context.missionContext !==
      undefined,
    "Normal context builder must produce governed mission context when the governed pipeline is configured.",
  );

  console.log(
    "001.DISPATCH normal context builder uses governed memory pipeline: SUCCESS",
  );

  assert(
    context.missionContext!.memories.some(
      (
        item,
      ) =>
        item.id ===
        currentTruth.id,
    ),
    "Normal dispatch context must contain current creator-approved truth.",
  );

  console.log(
    "002.DISPATCH creator-approved current truth enters normal execution context: SUCCESS",
  );

  assert(
    !context.missionContext!.memories.some(
      (
        item,
      ) =>
        item.id ===
        obsolete.id,
    ),
    "Normal dispatch context must exclude superseded memory.",
  );

  console.log(
    "003.DISPATCH superseded memory blocked from normal execution: SUCCESS",
  );

  assert(
    context.missionContext!.knowledge?.records.some(
      (
        record,
      ) =>
        record.id ===
        knowledge.id,
    ) ===
      true,
    "Normal dispatch context must contain authoritative knowledge.",
  );

  console.log(
    "004.DISPATCH authoritative knowledge enters normal execution context: SUCCESS",
  );

  assert(
    context.missionContext!.missionId ===
      task.missionId &&
    context.missionContext!.taskId ===
      task.id,
    "Normal dispatch context must preserve mission/task identity.",
  );

  console.log(
    "005.DISPATCH mission/task continuity preserved: SUCCESS",
  );

  console.log(
    "MEMORY-INTEGRATION-003 NORMAL WORKFORCE DISPATCH MEMORY GOVERNANCE: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );
  },
);
