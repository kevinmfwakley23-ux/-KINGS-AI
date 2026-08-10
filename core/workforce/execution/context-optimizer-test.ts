import type {
  AgentDefinition,
  Evidence,
  KnowledgeRecord,
  MemoryResult,
  Task,
} from "../types";

import type {
  AgentExecutionContext,
} from "./adapter";

import {
  ExecutionContextOptimizer,
} from "./context-optimizer";

function createRecord(
  id: string,
  sourceId: string,
  evidenceIds: string[],
): KnowledgeRecord {
  return {
    id,
    sourceId,
    memoryType: "semantic",
    summary: `Knowledge record ${id}`,
    evidenceIds,
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createEvidence(
  id: string,
  sourceId: string,
): Evidence {
  return {
    id,
    sourceId,
    description: `Evidence ${id}`,
    location: `source/${sourceId}`,
    createdAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const agent: AgentDefinition = {
    id: "agent-context-optimizer-test",
    name: "Context Optimizer Test Agent",
    role: "Context optimization worker",
    description:
      "Verifies deterministic task-context optimization.",
    capabilities: ["context-test"],
    toolIds: [],
    status: "available",
  };

  const task: Task = {
    id: "task-context-optimizer-test",
    missionId: "mission-context-optimizer-test",
    name: "Optimize execution context",
    description:
      "Verify that execution context is reduced without losing provenance.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["context-test"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Optimized execution context",
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const records = [
    createRecord(
      "record-1",
      "source-1",
      ["evidence-1"],
    ),
    createRecord(
      "record-2",
      "source-2",
      ["evidence-2"],
    ),
    createRecord(
      "record-3",
      "source-3",
      ["evidence-3"],
    ),
  ];

  const evidence = [
    createEvidence(
      "evidence-1",
      "source-1",
    ),
    createEvidence(
      "evidence-2",
      "source-2",
    ),
    createEvidence(
      "evidence-3",
      "source-3",
    ),
    createEvidence(
      "evidence-unused",
      "source-unused",
    ),
  ];

  const knowledge: MemoryResult = {
    query: "context optimization",
    records,
    evidence,
    sourceIds: [
      "source-1",
      "source-2",
      "source-3",
      "source-unused",
    ],
    createdAt: new Date().toISOString(),
  };

  const context: AgentExecutionContext = {
    agent,
    task,
    knowledge,
  };

  const optimizer =
    new ExecutionContextOptimizer({
      maxRecords: 2,
      maxEvidence: 2,
    });

  const optimized =
    optimizer.optimize(context);

  if (optimized.agent !== agent) {
    throw new Error(
      "Context optimizer failed to preserve agent context.",
    );
  }

  if (optimized.task !== task) {
    throw new Error(
      "Context optimizer failed to preserve task context.",
    );
  }

  if (!optimized.knowledge) {
    throw new Error(
      "Context optimizer unexpectedly removed knowledge.",
    );
  }

  if (
    optimized.knowledge.records.length !== 2
  ) {
    throw new Error(
      "Context optimizer failed to enforce record limit.",
    );
  }

  if (
    optimized.knowledge.evidence.length !== 2
  ) {
    throw new Error(
      "Context optimizer failed to enforce evidence limit.",
    );
  }

  if (
    optimized.knowledge.evidence.some(
      (item) =>
        item.id === "evidence-unused",
    )
  ) {
    throw new Error(
      "Context optimizer retained unrelated evidence.",
    );
  }

  const retainedEvidenceIds =
    new Set(
      optimized.knowledge.evidence.map(
        (item) => item.id,
      ),
    );

  for (
    const record of
      optimized.knowledge.records
  ) {
    for (
      const evidenceId of
        record.evidenceIds
    ) {
      if (
        !retainedEvidenceIds.has(
          evidenceId,
        )
      ) {
        throw new Error(
          "Context optimizer retained an orphaned evidence reference.",
        );
      }
    }
  }

  if (
    optimized.knowledge.sourceIds.length !==
    2
  ) {
    throw new Error(
      "Context optimizer failed to rebuild source provenance.",
    );
  }

  const emptyContext: AgentExecutionContext = {
    agent,
    task,
  };

  const unchanged =
    optimizer.optimize(
      emptyContext,
    );

  if (
    unchanged.knowledge !==
    undefined
  ) {
    throw new Error(
      "Context optimizer altered a context with no knowledge.",
    );
  }

  console.log(
    "Context record limit: SUCCESS",
  );
  console.log(
    "Context evidence limit: SUCCESS",
  );
  console.log(
    "Relevant evidence preserved: SUCCESS",
  );
  console.log(
    "Orphaned evidence removed: SUCCESS",
  );
  console.log(
    "Source provenance rebuilt: SUCCESS",
  );
  console.log(
    "Knowledge-free context preserved: SUCCESS",
  );
  console.log(
    "INTELLIGENCE-005 context optimization authority: SUCCESS",
  );
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. CONTEXT OPTIMIZER TEST FAILED ===",
  );
  console.error(error);
  process.exitCode = 1;
});
