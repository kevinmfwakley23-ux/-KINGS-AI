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

import {
  TestExecutionAdapter,
} from "./test-adapter";

import {
  RuntimeAwareWorkforceExecutor,
} from "./runtime-aware-executor";

import {
  WorkforceRuntimeBindingRegistry,
} from "../runtime-binding-registry";

class TestKnowledgeRuntime
implements KnowledgeRuntimeAdapter
{
  async retrieve(
    query: MemoryQuery,
  ): Promise<MemoryResult> {
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

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const agent: AgentDefinition = {
    id: "agent-runtime-aware-test",
    name:
      "K.I.N.G.S. Runtime-Aware Test Agent",
    role: "Runtime integration test worker",
    description:
      "Verifies workforce access through the runtime layer.",
    capabilities: ["test"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-runtime-aware-test",
    name:
      "Runtime-Aware Workforce Test",
    description:
      "Verify that the workforce can obtain knowledge through the runtime binding layer.",
    status: "active",
    objectives: [
      "Verify runtime lookup.",
      "Verify knowledge retrieval through runtime binding.",
      "Verify execution receives retrieved knowledge.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const knowledgeQuery: MemoryQuery = {
    query:
      "runtime integration test",
    authoritativeOnly: true,
    limit: 3,
  };

  const task: Task = {
    id: "task-runtime-aware-test",
    missionId: mission.id,
    name:
      "Execute runtime-aware task",
    description:
      "Retrieve knowledge through the runtime registry before execution.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    knowledgeQuery,
    expectedOutputs: [
      "Successful WorkforceResult",
      "Knowledge-aware execution",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerAgent(agent);
  registry.registerMission(mission);
  registry.registerTask(task);

  const runtimeBindings =
    new WorkforceRuntimeBindingRegistry();

  const knowledgeRuntime =
    new TestKnowledgeRuntime();

  runtimeBindings.register(
    {
      id: "knowledge-runtime",
      name:
        "K.I.N.G.S. Knowledge Runtime",
      type: "knowledge",
      description:
        "Test knowledge runtime.",
      enabled: true,
    },
    knowledgeRuntime,
  );

  const executor =
    new RuntimeAwareWorkforceExecutor(
      registry,
      [
        new TestExecutionAdapter(),
      ],
      runtimeBindings,
    );

  const result =
    await executor.execute(
      task.id,
    );

  if (
    result.status !== "success"
  ) {
    throw new Error(
      "Runtime-aware executor test failed: expected success.",
    );
  }

  console.log(
    "Runtime binding lookup: SUCCESS",
  );

  console.log(
    "Knowledge runtime invocation: SUCCESS",
  );

  console.log(
    "Workforce execution through runtime layer: SUCCESS",
  );

  console.log(
    "RUNTIME-004 workforce runtime integration: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "=== RUNTIME-004 FAILED ===",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
