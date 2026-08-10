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
  RuntimeAwareWorkforceExecutor,
} from "./runtime-aware-executor";

import {
  WorkforceRegistry,
} from "../registry";

import {
  WorkforceRuntimeBindingRegistry,
} from "../runtime-binding-registry";

import type {
  AgentDefinition,
  MemoryQuery,
  MemoryResult,
  Mission,
  Task,
  WorkforceResult,
} from "../types";

import type {
  MissionState,
} from "../mission-continuity";

import type {
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import type {
  AgentExecutionContext,
  AgentExecutionAdapter,
} from "./adapter";

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

class TestKnowledgeRuntime
  implements KnowledgeRuntimeAdapter
{
  called = false;

  async retrieve(
    query: MemoryQuery,
  ): Promise<MemoryResult> {
    this.called = true;

    return {
      query:
        query.query,
      records: [
        {
          id:
            "knowledge-014",
          sourceId:
            "source-014",
          memoryType:
            "semantic",
          summary:
            "Project Brain knowledge confirms the unified context boundary.",
          content:
            "Mission memory and Project Brain knowledge are combined into read-only execution context.",
          evidenceIds: [],
          authoritative:
            true,
          createdAt:
            new Date().toISOString(),
          updatedAt:
            new Date().toISOString(),
        },
      ],
      evidence: [],
      sourceIds: [
        "source-014",
      ],
      createdAt:
        new Date().toISOString(),
    };
  }
}

class ContextObservingAdapter
  implements AgentExecutionAdapter
{
  readonly id =
    "intelligence-014-context-observer";

  readonly name =
    "K.I.N.G.S. INTELLIGENCE-014 Context Observer";

  receivedMissionContext = false;
  receivedMissionMemory = false;
  receivedKnowledge = false;

  canExecute(
    agent: AgentDefinition,
  ): boolean {
    return agent.capabilities.includes(
      "test",
    );
  }

  async execute(
    context: AgentExecutionContext,
  ): Promise<WorkforceResult> {
    this.receivedMissionContext =
      context.missionContext !==
      undefined;

    this.receivedMissionMemory =
      (
        context.missionContext
          ?.memories.length ?? 0
      ) > 0;

    this.receivedKnowledge =
      context.knowledge !==
      undefined;

    return {
      id:
        `result-${context.task.id}`,
      taskId:
        context.task.id,
      agentId:
        context.agent.id,
      status:
        "success",
      summary:
        "INTELLIGENCE-014 real executor context delivery succeeded.",
      artifactIds: [],
      reasoning:
        "The real RuntimeAwareWorkforceExecutor delivered unified mission context to the execution adapter.",
      verificationReferences: [],
      createdAt:
        new Date().toISOString(),
    };
  }
}

async function main(): Promise<void> {
  const now =
    new Date().toISOString();

  const registry =
    new WorkforceRegistry();

  const memoryStore =
    new MemoryStore();

  const promotionGate =
    new MemoryPromotionGate();

  const missionMemory =
    new MissionMemoryBridge(
      memoryStore,
      promotionGate,
    );

  const agent:
    AgentDefinition = {
    id:
      "agent-intelligence-014",
    name:
      "K.I.N.G.S. Intelligence 014 Agent",
    role:
      "Unified mission context worker",
    description:
      "Verifies the real runtime-aware executor delivers mission memory and Project Brain knowledge.",
    capabilities: [
      "test",
    ],
    toolIds: [],
    status:
      "available",
  };

  const mission:
    Mission = {
    id:
      "mission-intelligence-014",
    name:
      "INTELLIGENCE-014 Unified Context",
    description:
      "Verify unified mission context reaches real execution.",
    status:
      "active",
    objectives: [
      "Deliver mission memory.",
      "Deliver Project Brain knowledge.",
      "Preserve runtime integration.",
    ],
    sourceReferences: [],
    createdAt:
      now,
    updatedAt:
      now,
  };

  const task:
    Task = {
    id:
      "task-intelligence-014",
    missionId:
      mission.id,
    name:
      "Real unified context execution",
    description:
      "Execute through the real RuntimeAwareWorkforceExecutor.",
    assignedAgentId:
      agent.id,
    requiredCapabilities: [
      "test",
    ],
    requiredToolIds: [],
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [],
    knowledgeQuery: {
      query:
        "INTELLIGENCE-014 unified mission context",
      authoritativeOnly:
        true,
      limit:
        5,
    },
    expectedOutputs: [
      "Unified mission context",
      "Mission memory",
      "Project Brain knowledge",
    ],
    createdAt:
      now,
    updatedAt:
      now,
  };

  registry.registerAgent(
    agent,
  );

  registry.registerMission(
    mission,
  );

  registry.registerTask(
    task,
  );

  const state:
    MissionState = {
    missionId:
      mission.id,
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
      "evidence-014",
    ],
    updatedAt:
      now,
  };

  const memoryRegistration =
    missionMemory.rememberState(
      state,
      {
        sourceReferences: [
          "INTELLIGENCE-014-test",
        ],
      },
      "episodic",
    );

  assert(
    memoryRegistration.missionId ===
      mission.id,
    "Mission state must be registered against the correct mission.",
  );

  console.log(
    "Mission memory prepared: SUCCESS",
  );

  const knowledgeRuntime =
    new TestKnowledgeRuntime();

  const runtimeBindings =
    new WorkforceRuntimeBindingRegistry();

  runtimeBindings.register(
    {
      id:
        "knowledge-runtime",
      name:
        "K.I.N.G.S. Knowledge Runtime",
      type:
        "knowledge",
      description:
        "INTELLIGENCE-014 test knowledge runtime.",
      enabled:
        true,
    },
    knowledgeRuntime,
  );

  const adapter =
    new ContextObservingAdapter();

  const executor =
    new RuntimeAwareWorkforceExecutor(
      registry,
      [
        adapter,
      ],
      runtimeBindings,
      missionMemory,
    );

  const result =
    await executor.execute(
      task.id,
    );

  assert(
    result.status ===
      "success",
    "Real RuntimeAwareWorkforceExecutor must complete successfully.",
  );

  console.log(
    "Real RuntimeAwareWorkforceExecutor execution: SUCCESS",
  );

  assert(
    knowledgeRuntime.called,
    "Knowledge runtime must be invoked.",
  );

  console.log(
    "Project Brain runtime retrieval: SUCCESS",
  );

  assert(
    adapter.receivedMissionContext,
    "Execution adapter must receive unified mission context.",
  );

  console.log(
    "Unified mission context delivered to worker: SUCCESS",
  );

  assert(
    adapter.receivedMissionMemory,
    "Execution adapter must receive mission memory.",
  );

  console.log(
    "Mission memory delivered to worker: SUCCESS",
  );

  assert(
    adapter.receivedKnowledge,
    "Execution adapter must receive Project Brain knowledge.",
  );

  console.log(
    "Project Brain knowledge delivered to worker: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-014 real execution context integration: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    throw error;
  },
);
