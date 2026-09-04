import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import type {
  AgentDefinition,
  MemoryResult,
  Mission,
  Task,
} from "../types";

import {
  WorkforceRegistry,
} from "../registry";

import {
  WorkforceExecutor,
} from "./executor";

import {
  WorkUnitRegistry,
} from "../work-unit-registry";

import {
  registerTestWorkUnit,
} from "./test-work-unit";

import type {
  AgentExecutionAdapter,
  AgentExecutionContext,
} from "./adapter";

import {
  createDefaultKnowledgeRuntimeAdapter,
} from "../../../runtimes/knowledge-runtime/adapter";

class RealKnowledgeTestAdapter
implements AgentExecutionAdapter
{
  readonly id =
    "real-knowledge-test-adapter";

  readonly name =
    "K.I.N.G.S. Real Knowledge Test Adapter";

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
        "Real authoritative knowledge reached the workforce execution adapter.",
      artifactIds: [],
      reasoning:
        "The real K.I.N.G.S. knowledge runtime supplied read-only project knowledge.",
      verificationReferences: [],
      createdAt:
        new Date().toISOString(),
    };
  }
}

async function main(): Promise<void> {
  const knowledgeRoot =
    mkdtempSync(
      join(
        tmpdir(),
        "kings-real-knowledge-",
      ),
    );

  const fixture = {
    sourceId:
      "kings-collectibles-blueprints",
    title:
      "KINGS Collectibles Blueprint",
    type:
      "blueprint",
    authority:
      "product-blueprint",
    sha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    path:
      "/fixtures/kings-collectibles-blueprints.md",
    pages: [
      {
        page: 1,
        text:
          "Collector's Kingdom is authoritative KINGS Collectibles project knowledge. The Vault and Keeper framework are part of the collector experience.",
      },
    ],
  };

  writeFileSync(
    join(
      knowledgeRoot,
      "kings-collectibles-blueprints.json",
    ),
    JSON.stringify(
      fixture,
      null,
      2,
    ),
    "utf8",
  );

  process.env.KINGS_KNOWLEDGE_EXTRACTED_ROOT =
    knowledgeRoot;

  try {
  const registry =
    new WorkforceRegistry();

  const knowledgeRuntime =
    createDefaultKnowledgeRuntimeAdapter();

  const executionAdapter =
    new RealKnowledgeTestAdapter();

  const agent: AgentDefinition = {
    id:
      "agent-real-knowledge-test",
    name:
      "K.I.N.G.S. Real Knowledge Test Agent",
    role:
      "Authoritative knowledge verification worker",
    description:
      "Verifies the complete workforce-to-project-knowledge path.",
    capabilities: ["test"],
    toolIds: [],
    status: "available",
  };

  const mission: Mission = {
    id:
      "mission-real-knowledge-test",
    name:
      "Real Knowledge Workforce Test",
    description:
      "Verify that a workforce task can retrieve real authoritative KINGS Collectibles knowledge before execution.",
    status: "active",
    objectives: [
      "Retrieve authoritative Collector's Kingdom knowledge.",
      "Preserve source provenance.",
      "Pass knowledge to the execution adapter.",
    ],
    sourceReferences: [
      "kings-collectibles-blueprints",
      "kings-collectibles-construction-documents",
      "kings-ai-build-directive",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const task: Task = {
    id:
      "task-real-knowledge-test",
    missionId: mission.id,
    name:
      "Retrieve Collector's Kingdom requirements",
    description:
      "Retrieve authoritative project knowledge before execution.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    knowledgeQuery: {
      query:
        "Collector's Kingdom",
      authoritativeOnly: true,
      limit: 5,
    },
    expectedOutputs: [
      "Authoritative project knowledge",
      "Knowledge provenance",
      "Successful WorkforceResult",
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

  const knowledge =
    executionAdapter.receivedKnowledge;

  if (!knowledge) {
    throw new Error(
      "Real knowledge test failed: no knowledge reached execution adapter.",
    );
  }

  if (
    knowledge.records.length === 0
  ) {
    throw new Error(
      "Real knowledge test failed: authoritative retrieval returned no records.",
    );
  }

  if (
    knowledge.evidence.length === 0
  ) {
    throw new Error(
      "Real knowledge test failed: retrieval returned no evidence.",
    );
  }

  if (
    knowledge.sourceIds.length === 0
  ) {
    throw new Error(
      "Real knowledge test failed: retrieval returned no source IDs.",
    );
  }

  if (
    result.status !== "success"
  ) {
    throw new Error(
      "Real knowledge test failed: workforce execution did not succeed.",
    );
  }

  console.log(
    "Real authoritative knowledge retrieval: SUCCESS",
  );

  console.log(
    `Knowledge records: ${knowledge.records.length}`,
  );

  console.log(
    `Evidence items: ${knowledge.evidence.length}`,
  );

  console.log(
    `Sources consulted: ${knowledge.sourceIds.join(", ")}`,
  );

  console.log(
    "Knowledge provenance preserved: SUCCESS",
  );

  console.log(
    "Knowledge reached workforce execution adapter: SUCCESS",
  );

  console.log(
    "Real workforce-to-knowledge execution: SUCCESS",
  );
  } finally {
    delete process.env.KINGS_KNOWLEDGE_EXTRACTED_ROOT;

    rmSync(
      knowledgeRoot,
      {
        recursive: true,
        force: true,
      },
    );
  }
}

main().catch(
  (error: unknown) => {
    console.error(
      "Real workforce-to-knowledge test: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
