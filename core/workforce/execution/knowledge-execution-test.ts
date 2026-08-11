import type {
  AgentDefinition,
  MemoryQuery,
  MemoryResult,
  Mission,
  Task,
} from "../types";

import {
  WorkforceRegistry,
} from "../registry";

import type {
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import type {
  AgentExecutionAdapter,
  AgentExecutionContext,
} from "./adapter";

import {
  WorkforceExecutor,
} from "./executor";

import {
  WorkUnitRegistry,
} from "../work-unit-registry";

import {
  registerTestWorkUnit,
} from "./test-work-unit";

class FakeKnowledgeRuntime
implements KnowledgeRuntimeAdapter
{
  readonly requestedQueries: MemoryQuery[] = [];

  async retrieve(
    query: MemoryQuery,
  ): Promise<MemoryResult> {
    this.requestedQueries.push(query);

    return {
      query: query.query,
      records: [],
      evidence: [],
      sourceIds:
        query.sourceIds ?? [],
      createdAt:
        new Date().toISOString(),
    };
  }
}

class KnowledgeAwareTestAdapter
implements AgentExecutionAdapter
{
  readonly id =
    "knowledge-aware-test-adapter";

  readonly name =
    "K.I.N.G.S. Knowledge-Aware Test Adapter";

  receivedKnowledge:
    MemoryResult | undefined;

  canExecute(
    agent: AgentDefinition,
  ): boolean {
    return agent.capabilities.includes("test");
  }

  async execute(
    context: AgentExecutionContext,
  ) {
    this.receivedKnowledge =
      context.knowledge;

    return {
      id: `result-${context.task.id}`,
      taskId: context.task.id,
      agentId: context.agent.id,
      status: "success" as const,
      summary:
        "Knowledge-aware execution succeeded.",
      artifactIds: [],
      reasoning:
        "Knowledge was supplied as read-only execution context.",
      verificationReferences: [],
      createdAt:
        new Date().toISOString(),
    };
  }
}

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const knowledgeRuntime =
    new FakeKnowledgeRuntime();

  const executionAdapter =
    new KnowledgeAwareTestAdapter();

  const agent: AgentDefinition = {
    id:
      "agent-knowledge-execution-test",
    name:
      "K.I.N.G.S. Knowledge Test Agent",
    role:
      "Knowledge-aware verification worker",
    description:
      "Verifies that authoritative knowledge can be supplied to execution.",
    capabilities: ["test"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id:
      "mission-knowledge-execution-test",
    name:
      "Knowledge Execution Test",
    description:
      "Verify workforce knowledge retrieval before execution.",
    status: "active",
    objectives: [
      "Verify task knowledge query.",
      "Verify knowledge runtime retrieval.",
      "Verify knowledge reaches the execution adapter.",
      "Verify knowledge remains read-only execution context.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const knowledgeQuery: MemoryQuery = {
    query:
      "Collector's Kingdom Royal Chambers",
    sourceIds: [
      "kings-collectibles-blueprints",
      "kings-collectibles-construction-documents",
    ],
    authoritativeOnly: true,
    limit: 5,
  };

  const task: Task = {
    id:
      "task-knowledge-execution-test",
    missionId: mission.id,
    name:
      "Execute knowledge-aware task",
    description:
      "Verify that the executor retrieves requested authoritative knowledge before execution.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    knowledgeQuery,
    expectedOutputs: [
      "Successful knowledge-aware WorkforceResult",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerAgent(agent);
  registry.registerMission(mission);
  registry.registerTask(task);

  const workUnitRegistry =
    new WorkUnitRegistry();

  registerTestWorkUnit(
    workUnitRegistry,
    task.id,
  );

  const executor =
    new WorkforceExecutor(
      registry,
      [executionAdapter],
      knowledgeRuntime,
      workUnitRegistry,
    );

  const result =
    await executor.execute(task.id);

  if (result.status !== "success") {
    throw new Error(
      "Knowledge execution test failed: execution did not succeed.",
    );
  }

  if (
    knowledgeRuntime.requestedQueries.length !== 1
  ) {
    throw new Error(
      "Knowledge execution test failed: knowledge runtime was not called exactly once.",
    );
  }

  const requestedQuery =
    knowledgeRuntime.requestedQueries[0];

  if (
    requestedQuery.query !==
    knowledgeQuery.query
  ) {
    throw new Error(
      "Knowledge execution test failed: query mismatch.",
    );
  }

  if (
    requestedQuery.authoritativeOnly !== true
  ) {
    throw new Error(
      "Knowledge execution test failed: authoritative-only requirement was not preserved.",
    );
  }

  if (
    executionAdapter.receivedKnowledge
      ?.query !== knowledgeQuery.query
  ) {
    throw new Error(
      "Knowledge execution test failed: retrieved knowledge did not reach execution adapter.",
    );
  }

  console.log(
    "Knowledge query retrieval: SUCCESS",
  );

  console.log(
    "Authoritative knowledge requirement preserved: SUCCESS",
  );

  console.log(
    "Knowledge passed to execution adapter: SUCCESS",
  );

  console.log(
    "Knowledge-aware workforce execution: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "Knowledge execution test: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
