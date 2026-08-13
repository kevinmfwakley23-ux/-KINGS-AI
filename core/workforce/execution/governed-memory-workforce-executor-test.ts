import type {
  AgentDefinition,
  MemoryReference,
  Task,
  WorkforceResult,
} from "../types";

import {
  WorkforceExecutor,
} from "./executor";

import {
  GovernedMemoryExecutionPipeline,
} from "../memory-governed-execution-pipeline";

import {
  MissionContextRetriever,
} from "./mission-context-retriever";

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

import type {
  AgentExecutionAdapter,
  AgentExecutionContext,
  AgentExecutionResult,
} from "./adapter";

import {
  WorkforceRegistry,
} from "../registry";

import {
  WorkUnitRegistry,
} from "../work-unit-registry";

declare const process: {
  exitCode?: number;
};

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

class TestAdapter
  implements AgentExecutionAdapter {
  readonly id =
    "memory-integration-004-test-adapter";

  readonly name =
    "Memory Integration 004 Test Adapter";

  receivedContext:
    AgentExecutionContext |
    undefined;

  canExecute(
    agent:
      AgentDefinition,
  ):
    boolean {
    return agent.capabilities.includes(
      "coding",
    );
  }

  async execute(
    context:
      AgentExecutionContext,
  ):
    Promise<AgentExecutionResult> {
    this.receivedContext =
      context;

    const memoryIds =
      context.missionContext?.memories.map(
        (
          memory,
        ) =>
          memory.id,
      ) ??
      [];

    return {
      id:
        "result-memory-integration-004",

      taskId:
        context.task.id,

      agentId:
        context.agent.id,

      status:
        "success",

      summary:
        "Normal WorkforceExecutor delivered governed memory context.",

      reasoning:
        [
          "Memory IDs:",
          ...memoryIds,
        ].join(
          " ",
        ),

      artifactIds:
        [],

      verificationReferences:
        [
          ...memoryIds,
        ],

      createdAt:
        "2026-08-13T02:00:00.000Z",
    };
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
      "mission-memory-integration-004",

    taskId:
      "task-memory-integration-004",

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

  const currentTruth =
    memory(
      "memory-executor-current-truth",
      "Creator-approved WorkforceExecutor path requires governed memory context.",
      {
        authoritative:
          true,
      },
    );

  const obsolete =
    memory(
      "memory-executor-obsolete",
      "Old executor path did not apply governed memory filtering.",
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
        "mission-memory-integration-004",

      activeTaskIds:
        [
          "task-memory-integration-004",
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
      "task-memory-integration-004",

    missionId:
      "mission-memory-integration-004",

    name:
      "Normal governed execution",

    description:
      "Execute through the normal WorkforceExecutor path with automatic governed memory.",

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
        "governed execution",
      ],

    createdAt:
      "2026-08-13T01:00:00.000Z",

    updatedAt:
      "2026-08-13T01:00:00.000Z",
  };

  const agent:
    AgentDefinition = {
    id:
      "agent-memory-integration-004",

    name:
      "Normal Workforce Agent",

    role:
      "engineering-worker",

    description:
      "Normal workforce worker used to prove automatic memory governance.",

    capabilities:
      [
        "coding",
      ],

    toolIds:
      [],

    status:
      "available",
  };

  task.assignedAgentId =
    agent.id;

  const workUnit = {
    id:
      "work-unit-memory-integration-004",

    role:
      "engineering-worker",

    objective:
      "Execute the task using governed memory context.",

    capabilityIds:
      [
        "coding",
      ],

    allowedToolIds:
      [],

    allowedPaths:
      [
        "core/workforce",
      ],

    budget:
      {
        maxTimeMs:
          60_000,

        maxTokens:
          1000,

        maxIterations:
          10,
      },

    dependencyIds:
      [],

    acceptanceCriteria:
      [
        "Governed memory context reaches the worker.",
      ],

    requiredEvidenceTypes:
      [
        "memory-context",
      ],

    approved:
      true,

    createdAt:
      "2026-08-13T01:00:00.000Z",

    updatedAt:
      "2026-08-13T01:00:00.000Z",
  };

  const workforce =
    new WorkforceRegistry();

  workforce.registerTask(
    task,
  );

  workforce.registerAgent(
    agent,
  );

  const workUnits =
    new WorkUnitRegistry();

  workUnits.register(
    task.id,
    workUnit,
  );

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
    new TestAdapter();

  const executor =
    new WorkforceExecutor(
      workforce,
      [
        adapter,
      ],
      new BrainAdapter(
        brain,
      ),
      workUnits,
      undefined,
      pipeline,
      async (
        taskId,
      ) => ({
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
      }),
    );

  const result =
    await executor.execute(
      task.id,
    );

  assert(
    result.status ===
      "success",
    "Normal WorkforceExecutor execution must succeed.",
  );

  console.log(
    "001.EXECUTOR normal WorkforceExecutor execution: SUCCESS",
  );

  assert(
    adapter.receivedContext !==
      undefined,
    "Normal worker adapter must receive execution context.",
  );

  console.log(
    "002.EXECUTOR normal adapter invocation: SUCCESS",
  );

  const receivedMemories =
    adapter.receivedContext!
      .missionContext
      ?.memories ??
    [];

  assert(
    receivedMemories.some(
      (
        item,
      ) =>
        item.id ===
        currentTruth.id,
    ),
    "Normal WorkforceExecutor must automatically deliver creator-approved current truth.",
  );

  console.log(
    "003.EXECUTOR automatic current-truth delivery: SUCCESS",
  );

  assert(
    !receivedMemories.some(
      (
        item,
      ) =>
        item.id ===
        obsolete.id,
    ),
    "Normal WorkforceExecutor must automatically block superseded memory.",
  );

  console.log(
    "004.EXECUTOR automatic superseded-memory protection: SUCCESS",
  );

  assert(
    adapter.receivedContext!
      .missionContext!
      .missionId ===
      task.missionId &&
    adapter.receivedContext!
      .missionContext!
      .taskId ===
      task.id,
    "Normal WorkforceExecutor must preserve mission/task continuity.",
  );

  console.log(
    "005.EXECUTOR automatic mission/task continuity: SUCCESS",
  );

  assert(
    result.reasoning?.includes(
      currentTruth.id,
    ) ===
      true,
    "Worker result must record delivery of current memory.",
  );

  console.log(
    "006.EXECUTOR governed memory evidence in worker result: SUCCESS",
  );

  console.log(
    "MEMORY-INTEGRATION-004 AUTOMATIC GOVERNED MEMORY IN NORMAL WORKFORCE EXECUTION: SUCCESS",
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
