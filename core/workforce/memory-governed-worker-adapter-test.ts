import type {
  AgentDefinition,
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
  MemoryReference,
  Task,
} from "./types";

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

import {
  GovernedMemoryWorkerAdapter,
} from "./memory-governed-worker-adapter";

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

declare const process: {
  exitCode?: number;
};

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
      "mission-memory-integration-002",

    taskId:
      "task-memory-integration-002",

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
      "source-memory-integration-002",

    type:
      "repository",

    name:
      "Governed Worker Memory Proof",

    description:
      "Verified knowledge used to prove governed worker context delivery.",

    location:
      "proof://kings/memory-integration-002",

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
      "evidence-memory-integration-002",

    sourceId:
      source.id,

    description:
      "Verified evidence supporting governed worker execution.",

    location:
      "proof://kings/memory-integration-002#evidence",

    excerpt:
      "Worker execution receives read-only mission-scoped memory context.",

    createdAt:
      "2026-08-13T00:00:00.000Z",
  };

  brain.registerEvidence(
    evidence,
  );

  const knowledge:
    KnowledgeRecord = {
    id:
      "knowledge-memory-integration-002",

    sourceId:
      source.id,

    memoryType:
      "procedural",

    summary:
      "Worker execution must receive governed read-only memory context.",

    content:
      "Worker adapters receive mission-scoped read-only memory and authoritative knowledge.",

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
      "memory-worker-current-truth",
      "Creator-approved worker architecture uses governed read-only memory context.",
      {
        authoritative:
          true,
      },
    );

  const history =
    memory(
      "memory-worker-history",
      "Earlier worker execution required explicit mission context.",
    );

  const obsolete =
    memory(
      "memory-worker-obsolete",
      "Old worker design without governed memory context.",
      {
        updatedAt:
          "2026-07-01T00:00:00.000Z",
      },
    );

  memoryStore.register(
    currentTruth,
  );

  memoryStore.register(
    history,
  );

  memoryStore.register(
    obsolete,
  );

  missionMemory.rememberState(
    {
      missionId:
        "mission-memory-integration-002",

      activeTaskIds:
        [
          "task-memory-integration-002",
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
          ...history.sourceReferences,
          ...obsolete.sourceReferences,
        ],

      updatedAt:
        "2026-08-13T01:00:00.000Z",
    },
    {
      sourceReferences:
        [
          ...currentTruth.sourceReferences,
          ...history.sourceReferences,
          ...obsolete.sourceReferences,
        ],
    },
    "episodic",
  );

  console.log(
    "001.WORKER governed memory source population: SUCCESS",
  );

  const task:
    Task = {
    id:
      "task-memory-integration-002",

    missionId:
      "mission-memory-integration-002",

    name:
      "Execute with governed memory",

    description:
      "Use the current worker architecture and governed memory context to execute the task.",

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
        "memory-aware worker execution",
      ],

    knowledgeQuery: {
      query:
        "governed read-only memory context worker execution",

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
      "agent-memory-integration-002",

    name:
      "Governed Memory Worker",

    role:
      "engineering-worker",

    description:
      "Worker used to prove governed memory reaches the real adapter boundary.",

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

  const adapter =
    new GovernedMemoryWorkerAdapter({
      pipeline,
    });

  assert(
    adapter.canExecute(
      agent,
    ),
    "Governed worker adapter must accept an authorized coding worker.",
  );

  console.log(
    "002.WORKER adapter capability authorization: SUCCESS",
  );

  const context =
    await adapter.prepare(
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
            history.sourceReferences[0],
            obsolete.sourceReferences[0],
          ],
      },
    );

  assert(
    context.missionContext !==
      undefined,
    "Prepared worker context must contain governed mission context.",
  );

  console.log(
    "003.WORKER governed context preparation: SUCCESS",
  );

  assert(
    context.missionContext!.memories.some(
      (
        memory,
      ) =>
        memory.id ===
        currentTruth.id,
    ),
    "Current creator-approved truth must reach the real worker adapter context.",
  );

  console.log(
    "004.WORKER current-truth delivery: SUCCESS",
  );

  assert(
    !context.missionContext!.memories.some(
      (
        memory,
      ) =>
        memory.id ===
        obsolete.id,
    ),
    "Superseded memory must not reach the worker adapter.",
  );

  console.log(
    "005.WORKER superseded-memory blocking: SUCCESS",
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
    "Authoritative Project Brain knowledge must reach the real worker adapter.",
  );

  console.log(
    "006.WORKER authoritative knowledge delivery: SUCCESS",
  );

  const observation =
    adapter.getLastObservation();

  assert(
    observation !==
      undefined,
    "Worker adapter must expose the governed execution observation.",
  );

  assert(
    observation!.estimatedContextTokens <=
      250,
    "Worker adapter context must remain within budget.",
  );

  console.log(
    "007.WORKER context-budget observation: SUCCESS",
  );

  const result =
    await adapter.execute(
      context,
    );

  assert(
    result.status ===
      "success",
    "Real worker adapter execution must accept valid governed context.",
  );

  assert(
    result.reasoning?.includes(
      currentTruth.id,
    ) ===
      true,
    "Worker execution reasoning must record selected current-truth memory.",
  );

  assert(
    result.reasoning?.includes(
      knowledge.id,
    ) ===
      true,
    "Worker execution reasoning must record authoritative knowledge.",
  );

  assert(
    result.taskId ===
      task.id &&
    result.agentId ===
      agent.id,
    "Worker result must preserve task and agent identity.",
  );

  console.log(
    "008.WORKER governed execution records memory and knowledge delivery: SUCCESS",
  );

  const rejected =
    await adapter.execute({
      agent,
      task,
      missionContext:
        undefined,
      knowledge:
        undefined,
    });

  assert(
    rejected.status ===
      "rejected",
    "Worker execution without governed mission context must be rejected.",
  );

  assert(
    rejected.taskId ===
      task.id &&
    rejected.agentId ===
      agent.id,
    "Rejected worker results must preserve task and agent identity.",
  );

  console.log(
    "009.WORKER missing-governed-context protection: SUCCESS",
  );

  console.log(
    "MEMORY-INTEGRATION-002 GOVERNED MEMORY → REAL WORKER ADAPTER: SUCCESS",
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
