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
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import type {
  MemoryQuery,
  MemoryReference,
  MemoryResult,
  Task,
} from "../types";

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

const now =
  "2026-08-12T15:30:00.000Z";

class TestKnowledgeRuntime
  implements KnowledgeRuntimeAdapter
{
  public readonly queries:
    MemoryQuery[] = [];

  private readonly result:
    MemoryResult;

  constructor() {
    this.result = {
      query:
        "architecture",
      records: [
        {
          id:
            "KNOWLEDGE-05-5-5-A",
          sourceId:
            "SOURCE-A",
          memoryType:
            "semantic",
          summary:
            "Authoritative architecture knowledge.",
          content:
            "Mission architecture context.",
          authoritative:
            true,
          evidenceIds: [
            "EVIDENCE-A",
          ],
          createdAt:
            now,
          updatedAt:
            now,
        },
        {
          id:
            "KNOWLEDGE-05-5-5-B",
          sourceId:
            "SOURCE-B",
          memoryType:
            "procedural",
          summary:
            "Execution architecture knowledge.",
          content:
            "Execution context procedure.",
          authoritative:
            true,
          evidenceIds: [
            "EVIDENCE-B",
          ],
          createdAt:
            now,
          updatedAt:
            now,
        },
        {
          id:
            "KNOWLEDGE-05-5-5-C",
          sourceId:
            "SOURCE-C",
          memoryType:
            "semantic",
          summary:
            "Additional architecture knowledge.",
          content:
            "Additional mission context.",
          authoritative:
            true,
          evidenceIds: [
            "EVIDENCE-C",
          ],
          createdAt:
            now,
          updatedAt:
            now,
        },
      ],
      evidence: [
        {
          id:
            "EVIDENCE-A",
          sourceId:
            "SOURCE-A",
          description:
            "Authoritative architecture evidence.",
          createdAt:
            now,
        },
        {
          id:
            "EVIDENCE-B",
          sourceId:
            "SOURCE-B",
          description:
            "Execution architecture evidence.",
          createdAt:
            now,
        },
        {
          id:
            "EVIDENCE-C",
          sourceId:
            "SOURCE-C",
          description:
            "Additional mission architecture evidence.",
          createdAt:
            now,
        },
      ],
      sourceIds: [
        "SOURCE-A",
        "SOURCE-B",
        "SOURCE-C",
      ],
      createdAt:
        now,
    };
  }

  async retrieve(
    query: MemoryQuery,
  ): Promise<MemoryResult> {
    this.queries.push({
      ...query,
    });

    return {
      ...this.result,
      records:
        this.result.records.map(
          (record) => ({
            ...record,
            evidenceIds: [
              ...record.evidenceIds,
            ],
          }),
        ),
      evidence:
        this.result.evidence.map(
          (item) => ({
            ...item,
          }),
        ),
      sourceIds: [
        ...this.result.sourceIds,
      ],
    };
  }
}

async function main(): Promise<void> {

const store =
  new MemoryStore();

const gate =
  new MemoryPromotionGate();

const bridge =
  new MissionMemoryBridge(
    store,
    gate,
  );

bridge.rememberState(
  {
    missionId:
      "MISSION-05-5-5",
    activeTaskIds: [
      "TASK-05-5-5",
    ],
    completedTaskIds: [],
    blockedTaskIds: [],
    failedTaskIds: [],
    openQuestionIds: [],
    riskIds: [],
    artifactIds: [],
    evidenceIds: [],
    updatedAt:
      now,
  },
  {
    sourceReferences: [
      "mission-context",
    ],
  },
  "semantic",
);

bridge.rememberDecision(
  {
    id:
      "DECISION-05-5-5",
    missionId:
      "MISSION-05-5-5",
    statement:
      "Use mission-scoped context retrieval.",
    rationale:
      "Execution context must remain bounded.",
    authoritative:
      true,
    locked:
      true,
    sourceReferences: [
      "mission-context",
    ],
    createdAt:
      now,
    updatedAt:
      now,
  },
  "semantic",
);

const task:
  Task = {
  id:
    "TASK-05-5-5",
  missionId:
    "MISSION-05-5-5",
  name:
    "Mission context integrity",
  description:
    "Validate bounded mission context retrieval.",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "ready",
  dependencyIds: [],
  inputReferences: [
    "mission-context",
  ],
  knowledgeQuery: {
    query:
      "architecture",
    authoritativeOnly:
      true,
    limit:
      10,
  },
  expectedOutputs: [
    "bounded context",
  ],
  createdAt:
    now,
  updatedAt:
    now,
};

const runtime =
  new TestKnowledgeRuntime();

const retriever =
  new MissionContextRetriever(
    bridge,
    runtime,
    {
      maxMemories:
        20,
      maxKnowledgeRecords:
        2,
      maxEvidence:
        1,
    },
  );

const context =
  await retriever.retrieve(
    task,
  );

assert(
  context.missionId ===
    task.missionId,
  "Mission identity was not preserved.",
);

assert(
  context.taskId ===
    task.id,
  "Task identity was not preserved.",
);

console.log(
  "05.5.5 mission identity boundary: SUCCESS",
);

assert(
  context.memories.length ===
    2,
  "Mission memory retrieval boundary was not preserved.",
);

console.log(
  "05.5.5 mission memory boundary: SUCCESS",
);

assert(
  context.memories[0]?.authoritative ===
    true,
  "Authoritative memory was not prioritized.",
);

console.log(
  "05.5.5 authoritative memory priority: SUCCESS",
);

assert(
  context.knowledge?.records.length ===
    2,
  "Knowledge record budget was not enforced.",
);

assert(
  context.knowledge?.evidence.length ===
    1,
  "Evidence budget was not enforced.",
);

console.log(
  "05.5.5 knowledge budget enforcement: SUCCESS",
);

assert(
  JSON.stringify(
    context.knowledge?.sourceIds,
  ) ===
    JSON.stringify([
      "SOURCE-A",
      "SOURCE-B",
    ]),
  "Knowledge source provenance was not derived from bounded records.",
);

console.log(
  "05.5.5 bounded source provenance: SUCCESS",
);

assert(
  runtime.queries.length ===
    1,
  "Knowledge runtime was not called exactly once.",
);

assert(
  runtime.queries[0]?.limit ===
    2,
  "Knowledge retrieval limit was not clamped to the context budget.",
);

console.log(
  "05.5.5 runtime budget propagation: SUCCESS",
);

const originalMemoryReferences = [
  ...context.memories[0].sourceReferences,
];

context.memories[0].sourceReferences.push(
  "MUTATION-ATTEMPT",
);

const freshContext =
  await retriever.retrieve(
    task,
  );

assert(
  JSON.stringify(
    context.memories[0].sourceReferences,
  ) !==
    JSON.stringify(
      freshContext.memories[0].sourceReferences,
    ),
  "Mission context memory instances were not isolated.",
);

assert(
  JSON.stringify(
    bridge.getMissionMemories(
      task.missionId,
    )[0].sourceReferences,
  ) ===
    JSON.stringify(
      originalMemoryReferences,
    ),
  "Mission memory provenance was mutated through the context package.",
);

console.log(
  "05.5.5 mission memory defensive isolation: SUCCESS",
);

const knowledgeRecord =
  context.knowledge!.records[0];

knowledgeRecord.evidenceIds.push(
  "MUTATION-EVIDENCE",
);

const freshKnowledge =
  await retriever.retrieve(
    task,
  );

assert(
  !freshKnowledge.knowledge!.records[0].evidenceIds.includes(
    "MUTATION-EVIDENCE",
  ),
  "Knowledge record mutation leaked across context retrievals.",
);

console.log(
  "05.5.5 knowledge record defensive isolation: SUCCESS",
);

const zeroMemoryRetriever =
  new MissionContextRetriever(
    bridge,
    runtime,
    {
      maxMemories:
        0,
      maxKnowledgeRecords:
        2,
      maxEvidence:
        1,
    },
  );

const zeroMemoryContext =
  await zeroMemoryRetriever.retrieve(
    task,
  );

assert(
  zeroMemoryContext.memories.length ===
    0,
  "Explicit zero memory limit was not respected.",
);

console.log(
  "05.5.5 zero-memory safety: SUCCESS",
);

const zeroKnowledgeRetriever =
  new MissionContextRetriever(
    bridge,
    runtime,
    {
      maxMemories:
        2,
      maxKnowledgeRecords:
        0,
      maxEvidence:
        0,
    },
  );

const zeroKnowledgeContext =
  await zeroKnowledgeRetriever.retrieve(
    task,
  );

assert(
  zeroKnowledgeContext.knowledge?.records.length ===
    0 &&
    zeroKnowledgeContext.knowledge?.evidence.length ===
      0 &&
    zeroKnowledgeContext.knowledge?.sourceIds.length ===
      0,
  "Explicit zero knowledge/evidence limits were not respected.",
);

console.log(
  "05.5.5 zero-knowledge safety: SUCCESS",
);

let invalidRejected =
  false;

try {
  new MissionContextRetriever(
    bridge,
    runtime,
    {
      maxMemories:
        -1,
      maxKnowledgeRecords:
        1,
      maxEvidence:
        1,
    },
  );
} catch (error: unknown) {
  invalidRejected =
    error instanceof Error &&
    error.message.includes(
      "non-negative integers",
    );
}

assert(
  invalidRejected,
  "Negative context limits were not rejected.",
);

console.log(
  "05.5.5 invalid-limit rejection: SUCCESS",
);

let fractionalRejected =
  false;

try {
  new MissionContextRetriever(
    bridge,
    runtime,
    {
      maxMemories:
        1.5,
      maxKnowledgeRecords:
        1,
      maxEvidence:
        1,
    },
  );
} catch (error: unknown) {
  fractionalRejected =
    error instanceof Error &&
    error.message.includes(
      "non-negative integers",
    );
}

assert(
  fractionalRejected,
  "Fractional context limits were not rejected.",
);

console.log(
  "05.5.5 fractional-limit rejection: SUCCESS",
);

const repeatedA =
  await retriever.retrieve(
    task,
  );

const repeatedB =
  await retriever.retrieve(
    task,
  );

assert(
  JSON.stringify(
    repeatedA.memories,
  ) ===
    JSON.stringify(
      repeatedB.memories,
    ),
  "Repeated mission memory retrieval was not deterministic.",
);

assert(
  JSON.stringify(
    repeatedA.knowledge?.records,
  ) ===
    JSON.stringify(
      repeatedB.knowledge?.records,
    ),
  "Repeated knowledge retrieval was not deterministic.",
);

console.log(
  "05.5.5 repeated-context determinism: SUCCESS",
);

const foreignMemory:
  MemoryReference = {
  id:
    "FOREIGN-MEMORY",
  type:
    "semantic",
  summary:
    "Foreign mission memory.",
  sourceReferences: [
    "mission-context",
  ],
  missionId:
    "MISSION-FOREIGN",
  authoritative:
    true,
  createdAt:
    now,
  updatedAt:
    now,
};

assert(
  foreignMemory.missionId !==
    task.missionId,
  "Foreign fixture did not represent a separate mission.",
);

console.log(
  "05.5.5 cross-mission boundary fixture: SUCCESS",
);

console.log(
  "TREE-05.5.5 MISSION CONTEXT INTEGRITY: SUCCESS",
);

}

main().catch(
  (error: unknown) => {
    console.error(
      "=== K.I.N.G.S. TREE 05.5.5 INTEGRITY TEST FAILED ===",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
