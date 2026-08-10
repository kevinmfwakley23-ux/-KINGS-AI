import type {
  AgentDefinition,
  MemoryQuery,
  MemoryResult,
  Mission,
  Task,
  WorkforceResult,
} from "../types";

import type {
  AgentExecutionContext,
} from "./adapter";

import {
  WorkforceRegistry,
} from "../registry";

import type {
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import type {
  AgentExecutionAdapter,
} from "./adapter";

import {
  RuntimeAwareWorkforceExecutor,
} from "./runtime-aware-executor";

import {
  WorkforceRuntimeBindingRegistry,
} from "../runtime-binding-registry";

class MemoryAwareKnowledgeRuntime
implements KnowledgeRuntimeAdapter {
  called = false;

  async retrieve(
    query: MemoryQuery,
  ): Promise<MemoryResult> {
    this.called = true;

    return {
      query: query.query,
      records: [],
      evidence: [],
      sourceIds: [],
      createdAt:
        new Date().toISOString(),
    };
  }
}

class ContextObservingAdapter
implements AgentExecutionAdapter {
  readonly id =
    "context-observing-adapter";

  readonly name =
    "K.I.N.G.S. Context Observing Adapter";

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
    this.receivedKnowledge =
      context.knowledge !== undefined;

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
        "Memory-aware execution succeeded.",
      artifactIds: [],
      reasoning:
        "Execution received the shared context authority output.",
      verificationReferences: [],
      createdAt:
        new Date().toISOString(),
    };
  }
}

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const agent:
    AgentDefinition = {
      id:
        "agent-intelligence-011",
      name:
        "K.I.N.G.S. Intelligence Test Agent",
      role:
        "Memory-aware execution worker",
      description:
        "Verifies execution receives context through the shared context authority.",
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
        "mission-intelligence-011",
      name:
        "Intelligence 011 Test",
      description:
        "Verify runtime-aware execution uses the shared context builder.",
      status:
        "active",
      objectives: [
        "Verify runtime binding resolution.",
        "Verify context builder execution.",
        "Verify retrieved knowledge reaches the adapter.",
      ],
      sourceReferences: [],
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString(),
    };

  const task:
    Task = {
      id:
        "task-intelligence-011",
      missionId:
        mission.id,
      name:
        "Memory-aware execution",
      description:
        "Execute through the runtime-aware workforce path.",
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
          "mission context",
        authoritativeOnly:
          true,
        limit:
          5,
      },
      expectedOutputs: [
        "Successful execution",
        "Memory-aware context",
      ],
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString(),
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

  const runtimeBindings =
    new WorkforceRuntimeBindingRegistry();

  const knowledgeRuntime =
    new MemoryAwareKnowledgeRuntime();

  runtimeBindings.register(
    {
      id:
        "knowledge-runtime",
      name:
        "K.I.N.G.S. Knowledge Runtime",
      type:
        "knowledge",
      description:
        "Test knowledge runtime.",
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
    );

  const result =
    await executor.execute(
      task.id,
    );

  if (
    result.status !==
    "success"
  ) {
    throw new Error(
      "Runtime-aware execution did not succeed",
    );
  }

  if (
    !knowledgeRuntime.called
  ) {
    throw new Error(
      "Knowledge runtime was not invoked through context authority",
    );
  }

  console.log(
    "Runtime binding preserved: SUCCESS",
  );

  if (
    !adapter.receivedKnowledge
  ) {
    throw new Error(
      "Execution adapter did not receive shared context",
    );
  }

  console.log(
    "Shared execution context delivered: SUCCESS",
  );

  console.log(
    "Memory-aware runtime execution: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-011 execution context integration: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    throw error;
  },
);
