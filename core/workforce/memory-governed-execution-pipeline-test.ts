import type {
  AgentDefinition,
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
  MemoryReference,
  Task,
} from "./types";

declare const process: { exitCode?: number };

import {
  MissionMemoryBridge,
} from "./mission-memory-bridge";

import {
  MemoryStore,
} from "./memory-store";

import {
  MemoryPromotionGate,
} from "./memory-promotion-gate";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

import {
  ProjectBrain,
} from "./project-brain";

import type {
  KnowledgeRuntimeAdapter,
} from "./knowledge-runtime-adapter";

import {
  MissionContextRetriever,
} from "./execution/mission-context-retriever";

import {
  GovernedMemoryExecutionPipeline,
} from "./memory-governed-execution-pipeline";

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
      "mission-memory-integration-001",
    taskId:
      "task-memory-integration-001",
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
      "source-memory-integration-001",

    type:
      "repository",

    name:
      "Governed Memory Integration Proof",

    description:
      "Verified knowledge source used by the governed execution pipeline.",

    location:
      "proof://kings/memory-integration-001",

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
      "evidence-memory-integration-001",

    sourceId:
      source.id,

    description:
      "Verified evidence supporting the current architecture rule.",

    location:
      "proof://kings/memory-integration-001#evidence",

    excerpt:
      "Use governed adapter boundaries for provider-specific execution.",

    createdAt:
      "2026-08-13T00:00:00.000Z",
  };

  brain.registerEvidence(
    evidence,
  );

  const knowledge:
    KnowledgeRecord = {
    id:
      "knowledge-memory-integration-001",

    sourceId:
      source.id,

    memoryType:
      "procedural",

    summary:
      "Use governed adapter boundaries for provider-specific execution.",

    content:
      "Provider-specific execution should occur behind governed adapter boundaries.",

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
      "memory-current-truth",
      "Creator-approved current architecture uses governed adapter boundaries.",
      {
        authoritative:
          true,

        sourceReferences:
          [
            "architecture",
          ],
      },
    );

  const usefulHistory =
    memory(
      "memory-useful-history",
      "Earlier implementation showed why adapter boundaries prevent provider coupling.",
      {
        sourceReferences:
          [
            "architecture",
          ],
      },
    );

  const obsoletePlan =
    memory(
      "memory-obsolete-plan",
      "Old architecture plan that has been replaced.",
      {
        updatedAt:
          "2026-07-01T00:00:00.000Z",

        sourceReferences:
          [
            "architecture",
          ],
      },
    );

  for (
    const item of [
      currentTruth,
      usefulHistory,
      obsoletePlan,
    ]
  ) {
    memoryStore.register(
      item,
    );
  }

  missionMemory.rememberState(
    {
      missionId:
        "mission-memory-integration-001",

      activeTaskIds:
        [
          "task-memory-integration-001",
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
          ...usefulHistory.sourceReferences,
          ...obsoletePlan.sourceReferences,
        ],

      updatedAt:
        "2026-08-13T01:00:00.000Z",
    },
    {
      sourceReferences:
        [
          ...currentTruth.sourceReferences,
          ...usefulHistory.sourceReferences,
          ...obsoletePlan.sourceReferences,
        ],
    },
    "episodic",
  );

  console.log(
    "001.INTEGRATION governed memory population: SUCCESS",
  );

  const task:
    Task = {
    id:
      "task-memory-integration-001",

    missionId:
      "mission-memory-integration-001",

    name:
      "Continue current governed architecture",

    description:
      "Use the current creator-approved architecture and verified adapter-boundary knowledge to continue implementation.",

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
        "adapter",
      ],

    expectedOutputs:
      [
        "verified governed implementation",
      ],

    knowledgeQuery: {
      query:
        "governed adapter boundaries provider-specific execution",

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

  const agent:
    AgentDefinition = {
    id:
      "agent-memory-integration-001",

    name:
      "Governed Memory Worker",

    role:
      "engineering-worker",

    description:
      "Worker used to prove governed memory reaches execution.",

    capabilities:
      [
        "coding",
      ],

    toolIds:
      [],

    status:
      "available",
  };

  const result =
    await pipeline.build(
      task,
      agent,
      {
        now:
          "2026-08-13T02:00:00.000Z",

        memoryBudgetTokens:
          250,

        minimumRetrievalQuality:
          0.30,

        supersededMemoryIds:
          [
            obsoletePlan.id,
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
            usefulHistory.sourceReferences[0],
            obsoletePlan.sourceReferences[0],
          ],
      },
    );

  assert(
    result.retrievedMemoryCount >
      0,
    "Normal mission retrieval must produce memory candidates.",
  );

  console.log(
    "002.INTEGRATION normal mission memory retrieval: SUCCESS",
  );

  assert(
    result.verifiedMemoryCount >
      0,
    "Integrity verification must permit valid memories into the pipeline.",
  );

  console.log(
    "003.INTEGRATION memory integrity gate: SUCCESS",
  );

  assert(
    result.selectedMemoryIds.includes(
      currentTruth.id,
    ),
    "Creator-approved current truth must survive normal governed retrieval.",
  );

  console.log(
    "004.INTEGRATION current-truth retrieval priority: SUCCESS",
  );

  assert(
    !result.selectedMemoryIds.includes(
      obsoletePlan.id,
    ),
    "Superseded memory must be excluded from execution.",
  );

  console.log(
    "005.INTEGRATION superseded-memory execution protection: SUCCESS",
  );

  assert(
    result.executionContext.memories.some(
      (
        memory,
      ) =>
        memory.id ===
        currentTruth.id,
    ),
    "Selected current truth must reach execution context.",
  );

  console.log(
    "006.INTEGRATION governed memory reaches execution context: SUCCESS",
  );

  assert(
    result.executionContext.knowledge?.records.some(
      (
        record,
      ) =>
        record.id ===
        knowledge.id,
    ) ===
      true,
    "Authoritative Project Brain knowledge must reach execution context.",
  );

  console.log(
    "007.INTEGRATION authoritative Project Brain knowledge reaches execution: SUCCESS",
  );

  assert(
    result.estimatedContextTokens <=
      250,
    "Execution context must remain within the configured memory budget.",
  );

  assert(
    result.remainingContextTokens >=
      0,
    "Execution context must never exceed its memory budget.",
  );

  console.log(
    "008.INTEGRATION context-budget enforcement: SUCCESS",
  );

  assert(
    result.executionContext.missionId ===
      task.missionId &&
    result.executionContext.taskId ===
      task.id,
    "Execution context must preserve mission and task identity.",
  );

  console.log(
    "009.INTEGRATION mission/task continuity preservation: SUCCESS",
  );

  console.log(
    "MEMORY-INTEGRATION-001 GOVERNED MEMORY → MISSION → EXECUTION: SUCCESS",
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
