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

import {
  MissionContextRetriever,
  type MissionContextPackage,
} from "./execution/mission-context-retriever";

import {
  createMissionExecutionContext,
} from "./execution/mission-execution-context";

import type {
  AgentDefinition,
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
  Task,
} from "./types";

import type {
  KnowledgeRuntimeAdapter,
} from "./knowledge-runtime-adapter";

import type {
  AgentExecutionContext,
} from "./execution/adapter";

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

class ProjectBrainKnowledgeRuntimeAdapter
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

  const registry =
    new KnowledgeRegistry();

  const brain =
    new ProjectBrain(
      registry,
    );

  const source:
    KnowledgeSource = {
    id:
      "source-memory-mission-execution",
    type:
      "repository",
    name:
      "Verified K.I.N.G.S. Engineering Knowledge",
    description:
      "Verified knowledge retained for later mission execution.",
    location:
      "proof://kings/memory-mission-execution",
    authoritative:
      false,
    createdAt:
      "2026-08-13T06:00:00.000Z",
    updatedAt:
      "2026-08-13T06:00:00.000Z",
  };

  brain.registerSource(
    source,
  );

  const evidence:
    Evidence = {
    id:
      "evidence-memory-mission-execution",
    sourceId:
      source.id,
    description:
      "Verified evidence supporting the retained engineering rule.",
    location:
      "proof://kings/memory-mission-execution#verification",
    excerpt:
      "Use explicit return types for public generated TypeScript functions.",
    createdAt:
      "2026-08-13T06:00:00.000Z",
  };

  brain.registerEvidence(
    evidence,
  );

  const learnedKnowledge:
    KnowledgeRecord = {
    id:
      "knowledge-memory-mission-execution",
    sourceId:
      source.id,
    memoryType:
      "semantic",
    summary:
      "Use explicit return types for public generated TypeScript functions.",
    content:
      "Public generated TypeScript functions should use explicit return types.",
    evidenceIds: [
      evidence.id,
    ],
    authoritative:
      true,
    createdAt:
      "2026-08-13T06:00:00.000Z",
    updatedAt:
      "2026-08-13T06:00:00.000Z",
  };

  brain.registerRecord(
    learnedKnowledge,
  );

  const learnedMemory =
    memoryStore.register({
      id:
        "memory-memory-mission-execution",
      type:
        "semantic",
      summary:
        learnedKnowledge.summary,
      sourceReferences: [
        evidence.id,
      ],
      authoritative:
        true,
      createdAt:
        "2026-08-13T06:00:00.000Z",
      updatedAt:
        "2026-08-13T06:00:00.000Z",
    });

  void learnedMemory;

  console.log(
    "05.INTEGRATION authoritative learned knowledge prepared: SUCCESS",
  );

  const missionId =
    "mission-memory-mission-execution";

  const task:
    Task = {
    id:
      "task-consume-learned-knowledge",
    missionId,
    name:
      "Use retained engineering knowledge",
    description:
      "Execute a task requiring previously learned authoritative knowledge.",
    requiredCapabilities: [
      "coding",
    ],
    requiredToolIds: [],
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [
      evidence.id,
    ],
    knowledgeQuery: {
      query:
        "explicit return types public generated TypeScript functions",
      authoritativeOnly:
        true,
      limit:
        5,
    },
    expectedOutputs: [
      "knowledge-aware execution",
    ],
    createdAt:
      "2026-08-13T06:00:01.000Z",
    updatedAt:
      "2026-08-13T06:00:01.000Z",
  };

  const missionMemoryRegistration =
    missionMemory.rememberState(
      {
        missionId,
        activeTaskIds: [
          task.id,
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
          "2026-08-13T06:00:01.000Z",
      },
      {
        sourceReferences: [
          evidence.id,
        ],
      },
      "episodic",
    );

  assert(
    missionMemoryRegistration.missionId ===
      missionId,
    "Mission memory must be bound to the same mission as the task.",
  );

  console.log(
    "05.INTEGRATION mission memory bound to task mission: SUCCESS",
  );

  const retriever =
    new MissionContextRetriever(
      missionMemory,
      new ProjectBrainKnowledgeRuntimeAdapter(
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

  const packageResult:
    MissionContextPackage =
      await retriever.retrieve(
        task,
      );

  assert(
    packageResult.missionId ===
      missionId,
    "Retrieved mission context must preserve mission identity.",
  );

  assert(
    packageResult.taskId ===
      task.id,
    "Retrieved mission context must preserve task identity.",
  );

  assert(
    packageResult.knowledge !==
      undefined,
    "Task knowledge query must produce Project Brain knowledge.",
  );

  assert(
    packageResult.knowledge!.records.some(
      (
        record,
      ) =>
        record.id ===
        learnedKnowledge.id,
    ),
    "Mission context must contain the authoritative learned knowledge requested by the task.",
  );

  assert(
    packageResult.knowledge!.evidence.some(
      (
        item,
      ) =>
        item.id ===
        evidence.id,
    ),
    "Mission context must retain the evidence supporting the learned knowledge.",
  );

  console.log(
    "05.INTEGRATION mission context retrieval: SUCCESS",
  );

  const agent:
    AgentDefinition = {
    id:
      "agent-memory-aware-proof",
    name:
      "Memory-Aware Proof Worker",
    role:
      "engineering-worker",
    description:
      "Worker used to prove mission knowledge reaches execution.",
    capabilities: [
      "coding",
    ],
    toolIds: [],
    status:
      "available",
  };

  const executionContext =
    createMissionExecutionContext({
      missionId,
      taskId:
        task.id,
      agent,
      task,
      memories:
        packageResult.memories,
      knowledge:
        packageResult.knowledge,
    });

  assert(
    executionContext.missionId ===
      missionId,
    "Execution context must preserve mission identity.",
  );

  assert(
    executionContext.taskId ===
      task.id,
    "Execution context must preserve task identity.",
  );

  assert(
    executionContext.knowledge!.records.some(
      (
        record,
      ) =>
        record.id ===
        learnedKnowledge.id,
    ),
    "Execution context must carry the learned knowledge into the worker boundary.",
  );

  assert(
    executionContext.knowledge!.records.some(
      (
        record,
      ) =>
        record.authoritative,
    ),
    "Execution context must carry authoritative knowledge rather than unverified knowledge.",
  );

  console.log(
    "05/06.INTEGRATION execution context carries retained knowledge: SUCCESS",
  );

  const adapterContext:
    AgentExecutionContext = {
    agent,
    task,
    missionContext:
      executionContext,
    knowledge:
      executionContext.knowledge,
  };

  assert(
    adapterContext.missionContext !==
      undefined,
    "Worker adapter must receive mission execution context.",
  );

  assert(
    adapterContext.missionContext!.knowledge!.records.some(
      (
        record,
      ) =>
        record.id ===
        learnedKnowledge.id,
    ),
    "Worker adapter must receive the retained learned knowledge.",
  );

  assert(
    adapterContext.knowledge!.records.some(
      (
        record,
      ) =>
        record.id ===
        learnedKnowledge.id,
    ),
    "Compatibility knowledge field must preserve the learned knowledge.",
  );

  console.log(
    "06.INTEGRATION worker execution adapter receives learned knowledge: SUCCESS",
  );

  console.log(
    "TREE-05/06 MEMORY → MISSION → EXECUTION: SUCCESS",
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
