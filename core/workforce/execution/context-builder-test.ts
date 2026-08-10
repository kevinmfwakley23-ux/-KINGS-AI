import type {
  AgentDefinition,
  MemoryQuery,
  MemoryResult,
  Task,
} from "../types";

import type {
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import {
  ExecutionContextBuilder,
} from "./context-builder";

class TestKnowledgeRuntime
  implements KnowledgeRuntimeAdapter
{
  public readonly queries: MemoryQuery[] = [];

  async retrieve(
    query: MemoryQuery,
  ): Promise<MemoryResult> {
    this.queries.push(query);

    return {
      query: query.query,
      records: [],
      evidence: [],
      sourceIds: ["source-context-test"],
      createdAt: new Date().toISOString(),
    };
  }
}

async function main(): Promise<void> {
  const agent: AgentDefinition = {
    id: "agent-context-test",
    name: "Context Test Agent",
    role: "Context Builder Test",
    description:
      "Agent used to verify task-scoped execution context.",
    capabilities: ["context-test"],
    toolIds: [],
    status: "available",
  };

  const knowledgeQuery: MemoryQuery = {
    query: "authoritative project architecture",
    authoritativeOnly: true,
    limit: 5,
  };

  const task: Task = {
    id: "task-context-test",
    missionId: "mission-context-test",
    name: "Build execution context",
    description:
      "Verify construction of task-scoped execution context.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["context-test"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: ["architecture-blueprint"],
    knowledgeQuery,
    expectedOutputs: [
      "Task-scoped execution context",
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const runtime = new TestKnowledgeRuntime();
  const builder =
    new ExecutionContextBuilder(runtime);

  const context =
    await builder.build(agent, task);

  if (context.agent.id !== agent.id) {
    throw new Error(
      "Context builder failed to preserve agent.",
    );
  }

  if (context.task.id !== task.id) {
    throw new Error(
      "Context builder failed to preserve task.",
    );
  }

  if (
    context.knowledge?.query !==
    knowledgeQuery.query
  ) {
    throw new Error(
      "Context builder failed to attach retrieved knowledge.",
    );
  }

  if (
    runtime.queries.length !== 1 ||
    runtime.queries[0]?.query !==
      knowledgeQuery.query
  ) {
    throw new Error(
      "Context builder failed to perform task-scoped retrieval.",
    );
  }

  const noKnowledgeTask: Task = {
    ...task,
    id: "task-context-no-knowledge",
    knowledgeQuery: undefined,
  };

  const noKnowledgeContext =
    await builder.build(
      agent,
      noKnowledgeTask,
    );

  if (
    noKnowledgeContext.knowledge !==
    undefined
  ) {
    throw new Error(
      "Context builder attached unexpected knowledge.",
    );
  }

  const missingRuntimeBuilder =
    new ExecutionContextBuilder();

  try {
    await missingRuntimeBuilder.build(
      agent,
      task,
    );

    throw new Error(
      "Context builder unexpectedly succeeded without knowledge runtime.",
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message.includes(
        "requires knowledge retrieval but no knowledge runtime is configured",
      )
    ) {
      throw error;
    }
  }

  console.log(
    "Task-scoped context construction: SUCCESS",
  );
  console.log(
    "Knowledge retrieval delegated: SUCCESS",
  );
  console.log(
    "Knowledge attached to execution context: SUCCESS",
  );
  console.log(
    "No-knowledge task context: SUCCESS",
  );
  console.log(
    "Missing knowledge runtime rejected: SUCCESS",
  );
  console.log(
    "INTELLIGENCE-004 execution context builder: SUCCESS",
  );
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. CONTEXT BUILDER TEST FAILED ===",
  );
  console.error(error);
  process.exitCode = 1;
});
