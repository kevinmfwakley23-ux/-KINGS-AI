import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  tmpdir,
} from "node:os";

import type {
  AgentDefinition,
  MemoryReference,
  Task,
} from "./types";

import {
  EvidenceStore,
} from "./evidence-store";

import {
  MissionContextRetriever,
} from "./execution/mission-context-retriever";

import {
  MemoryToActionEvaluationHarness,
  MemoryToActionEvaluationJournal,
} from "./memory-to-action-evaluation-harness";

import {
  MEMORY_TO_ACTION_CRITERION,
  MEMORY_TO_ACTION_EVIDENCE_TYPE,
  MemoryToActionEvaluationAuthority,
  type MemoryToActionExpectation,
} from "./memory-to-action-evaluation";

import {
  GovernedMemoryExecutionPipeline,
} from "./memory-governed-execution-pipeline";

import {
  MemoryPromotionGate,
} from "./memory-promotion-gate";

import {
  MemoryStore,
} from "./memory-store";

import {
  MissionMemoryBridge,
} from "./mission-memory-bridge";

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

async function expectFailure(
  action: () => Promise<unknown> | unknown,
  expectedMessage: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (message.includes(expectedMessage)) {
      return;
    }

    throw error;
  }

  throw new Error(
    `Expected failure containing "${expectedMessage}".`,
  );
}

async function main(): Promise<void> {
  const root =
    await mkdtemp(
      join(
        tmpdir(),
        "kings-memory-action-",
      ),
    );

  try {
    const missionId =
      "mission-memory-action-001";

    const taskId =
      "task-memory-action-001";

    const policyMemory:
      MemoryReference = {
      id:
        "memory-protect-main-branch",
      type:
        "procedural",
      summary:
        "Preserve main and write research changes to branch research/memory-to-action-evaluation with repository.create-file.",
      sourceReferences:
        [
          "owner-policy",
          "repository-policy",
        ],
      missionId,
      taskId,
      authoritative:
        true,
      createdAt:
        "2026-09-10T08:00:00.000Z",
      updatedAt:
        "2026-09-10T08:00:00.000Z",
    };

    const memoryStore =
      new MemoryStore();

    memoryStore.register(
      policyMemory,
    );

    const missionMemory =
      new MissionMemoryBridge(
        memoryStore,
        new MemoryPromotionGate(),
      );

    const pipeline =
      new GovernedMemoryExecutionPipeline(
        new MissionContextRetriever(
          missionMemory,
        ),
      );

    const task:
      Task = {
      id:
        taskId,
      missionId,
      name:
        "Apply the remembered repository policy",
      description:
        "Create the evaluation file without writing directly to main.",
      requiredCapabilities:
        [
          "coding",
          "tool-use",
        ],
      requiredToolIds:
        [
          "repository.create-file",
        ],
      status:
        "ready",
      dependencyIds:
        [],
      inputReferences:
        [
          "owner-policy",
          "repository-policy",
        ],
      expectedOutputs:
        [
          "a branch-scoped repository write",
        ],
      createdAt:
        "2026-09-11T08:00:00.000Z",
      updatedAt:
        "2026-09-11T08:00:00.000Z",
    };

    const agent:
      AgentDefinition = {
      id:
        "agent-memory-action-001",
      name:
        "Memory Action Evaluation Worker",
      role:
        "engineering-worker",
      description:
        "Worker fixture exercising the real governed memory pipeline.",
      capabilities:
        [
          "coding",
          "tool-use",
        ],
      toolIds:
        [
          "repository.create-file",
        ],
      status:
        "available",
    };

    const memoryExecution =
      await pipeline.build(
        task,
        agent,
        {
          now:
            "2026-09-11T08:05:00.000Z",
          memoryBudgetTokens:
            500,
          minimumRetrievalQuality:
            0,
          knownMissionIds:
            [missionId],
          knownTaskIds:
            [taskId],
          knownSourceIds:
            [
              "owner-policy",
              "repository-policy",
            ],
        },
      );

    assert(
      memoryExecution.selectedMemoryIds.includes(
        policyMemory.id,
      ),
      "The integration fixture must retrieve the authoritative policy through the governed memory pipeline.",
    );

    console.log(
      "001.INTEGRATION governed memory selected for an executable task: SUCCESS",
    );

    const expectation:
      MemoryToActionExpectation = {
      scenarioId:
        "branch-scoped-repository-write",
      taskId,
      missionId,
      requiredMemoryIds:
        [policyMemory.id],
      constraints:
        [
          {
            id:
              "protect-main",
            sourceMemoryId:
              policyMemory.id,
          },
        ],
      tool: {
        toolId:
          "repository.create-file",
        sourceMemoryIds:
          [policyMemory.id],
      },
      parameters:
        [
          {
            path:
              ["branch"],
            expected:
              "research/memory-to-action-evaluation",
            sourceMemoryId:
              policyMemory.id,
          },
          {
            path:
              [
                "file",
                "path",
              ],
            expected:
              "core/workforce/memory-to-action-evaluation.ts",
            sourceMemoryId:
              policyMemory.id,
          },
        ],
    };

    const storePath =
      join(
        root,
        "evaluation",
        "memory-to-action.json",
      );

    const journal =
      new MemoryToActionEvaluationJournal(
        storePath,
      );

    await journal.initialize();

    const evidenceStore =
      new EvidenceStore();

    const harness =
      new MemoryToActionEvaluationHarness(
        journal,
        evidenceStore,
      );

    const run =
      await harness.run(
        [
          {
            expectation,
            async execute() {
              return {
                memoryExecution,
                observation: {
                  recognizedConstraintIds:
                    ["protect-main"],
                  toolCall: {
                    toolId:
                      "repository.create-file",
                    arguments: {
                      branch:
                        "research/memory-to-action-evaluation",
                      file: {
                        path:
                          "core/workforce/memory-to-action-evaluation.ts",
                      },
                    },
                  },
                },
              };
            },
          },
        ],
        {
          runId:
            "memory-action-run-001",
          createdAt:
            "2026-09-11T08:10:00.000Z",
        },
      );

    assert(
      run.passed &&
      run.summary.passRate === 1,
      "A fully grounded memory-to-action scenario must pass.",
    );

    assert(
      Object.values(
        run.summary.stageScores,
      ).every(
        (score) => score === 1,
      ),
      "Retrieval, constraint recognition, tool selection, and parameter grounding must be scored independently.",
    );

    assert(
      run.records[0]?.usedMemoryIds.includes(
        policyMemory.id,
      ) === true &&
      run.records[0]?.retrievedButUnusedMemoryIds.length ===
        0,
      "The record must distinguish memory that influenced the action from memory that was merely retrieved.",
    );

    console.log(
      "002.INTEGRATION four-stage memory-to-action evaluation: SUCCESS",
    );

    const completionEvidence =
      evidenceStore.get(
        `EVIDENCE:${run.records[0]?.id}`,
      );

    assert(
      completionEvidence?.type ===
        MEMORY_TO_ACTION_EVIDENCE_TYPE &&
      completionEvidence.criterion ===
        MEMORY_TO_ACTION_CRITERION &&
      completionEvidence.status ===
        "passed" &&
      completionEvidence.verificationReference ===
        "memory-to-action://memory-action-run-001/branch-scoped-repository-write",
      "A passing evaluation must enter the existing completion evidence boundary with deterministic provenance.",
    );

    console.log(
      "003.INTEGRATION native completion evidence emission: SUCCESS",
    );

    const persisted =
      JSON.parse(
        await readFile(
          storePath,
          "utf8",
        ),
      ) as {
        version: number;
        runs: unknown[];
      };

    assert(
      persisted.version === 1 &&
      persisted.runs.length === 1,
      "The evaluation run must be persisted using the versioned journal schema.",
    );

    const resumedJournal =
      new MemoryToActionEvaluationJournal(
        storePath,
      );

    await resumedJournal.initialize();

    const resumedRun =
      resumedJournal.get(
        run.id,
      );

    assert(
      resumedRun?.records[0]?.id ===
        run.records[0]?.id,
      "A fresh runtime must recover the durable evaluation record.",
    );

    if (resumedRun) {
      resumedRun.records[0]!.usedMemoryIds.length =
        0;
    }

    assert(
      resumedJournal.get(run.id)
        ?.records[0]
        ?.usedMemoryIds.includes(
          policyMemory.id,
        ) === true,
      "Journal reads must not permit external mutation of retained evidence.",
    );

    const resumedEvidenceStore =
      new EvidenceStore();

    const resumedHarness =
      new MemoryToActionEvaluationHarness(
        resumedJournal,
        resumedEvidenceStore,
      );

    assert(
      resumedHarness.restoreEvidence(
        run.id,
      ) === 1 &&
      resumedEvidenceStore.get(
        `EVIDENCE:${run.records[0]?.id}`,
      )?.status === "passed",
      "A fresh runtime must be able to restore native completion evidence from the durable journal.",
    );

    assert(
      resumedHarness.restoreEvidence(
        run.id,
      ) === 0,
      "Restoring identical completion evidence must be idempotent.",
    );

    console.log(
      "004.INTEGRATION durable evaluation and completion-evidence recovery: SUCCESS",
    );

    const evaluator =
      new MemoryToActionEvaluationAuthority();

    const failed =
      evaluator.evaluate({
        runId:
          "memory-action-run-002",
        createdAt:
          "2026-09-11T08:11:00.000Z",
        expectation,
        memoryExecution,
        observation: {
          recognizedConstraintIds:
            [],
          toolCall: {
            toolId:
              "filesystem.delete",
            arguments: {
              branch:
                "main",
              file: {},
            },
          },
        },
      });

    assert(
      failed.stages.retrieval.passed &&
      !failed.stages[
        "constraint-recognition"
      ].passed &&
      !failed.stages[
        "tool-selection"
      ].passed &&
      !failed.stages[
        "parameter-grounding"
      ].passed,
      "Retrieval alone must not hide missed constraints, wrong tools, or wrong arguments.",
    );

    assert(
      !failed.passed &&
      failed.usedMemoryIds.length === 0 &&
      failed.retrievedButUnusedMemoryIds.includes(
        policyMemory.id,
      ),
      "A retrieved memory with no grounded downstream effect must be reported as unused.",
    );

    console.log(
      "005.NEGATIVE retrieved-without-use cannot pass: SUCCESS",
    );

    await expectFailure(
      () =>
        evaluator.evaluate({
          runId:
            "memory-action-run-003",
          createdAt:
            "2026-09-11T08:12:00.000Z",
          expectation,
          memoryExecution: {
            ...memoryExecution,
            selectedMemoryIds:
              [
                ...memoryExecution.selectedMemoryIds,
                "memory-not-in-context",
              ],
          },
          observation: {
            recognizedConstraintIds:
              ["protect-main"],
            toolCall: {
              toolId:
                "repository.create-file",
              arguments: {
                branch:
                  "research/memory-to-action-evaluation",
                file: {
                  path:
                    "core/workforce/memory-to-action-evaluation.ts",
                },
              },
            },
          },
        }),
      "selected memory ids must match",
    );

    console.log(
      "006.NEGATIVE inconsistent retrieval evidence rejected: SUCCESS",
    );

    await expectFailure(
      () =>
        evaluator.evaluate({
          runId:
            "memory-action-run-004",
          createdAt:
            "2026-09-11T08:13:00.000Z",
          expectation: {
            ...expectation,
            parameters: [
              {
                path: [
                  "__proto__",
                  "polluted",
                ],
                expected:
                  true,
                sourceMemoryId:
                  policyMemory.id,
              },
            ],
          },
          memoryExecution,
          observation: {
            recognizedConstraintIds:
              ["protect-main"],
            toolCall: {
              toolId:
                "repository.create-file",
              arguments: {},
            },
          },
        }),
      "unsafe parameter path segment",
    );

    console.log(
      "007.NEGATIVE unsafe parameter paths rejected: SUCCESS",
    );

    await expectFailure(
      () =>
        harness.run(
          [
            {
              expectation,
              async execute() {
                return {
                  memoryExecution,
                  observation: {
                    recognizedConstraintIds:
                      ["protect-main"],
                    toolCall: {
                      toolId:
                        "repository.create-file",
                      arguments: {
                        branch:
                          "research/memory-to-action-evaluation",
                        file: {
                          path:
                            "core/workforce/memory-to-action-evaluation.ts",
                        },
                      },
                    },
                  },
                };
              },
            },
          ],
          {
            runId:
              run.id,
            createdAt:
              "2026-09-11T08:14:00.000Z",
          },
        ),
      "already exists",
    );

    console.log(
      "008.NEGATIVE duplicate durable runs rejected: SUCCESS",
    );

    await writeFile(
      storePath,
      `${JSON.stringify({
        ...persisted,
        runs: [
          {
            ...run,
            summary: {
              ...run.summary,
              passRate: 0,
            },
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    const tamperedJournal =
      new MemoryToActionEvaluationJournal(
        storePath,
      );

    await expectFailure(
      () =>
        tamperedJournal.initialize(),
      "inconsistent summary",
    );

    console.log(
      "009.NEGATIVE tampered durable evaluation rejected: SUCCESS",
    );

    console.log(
      "MEMORY-TO-ACTION-001 EVALUATION HARNESS: SUCCESS",
    );
  } finally {
    await rm(
      root,
      {
        recursive: true,
        force: true,
      },
    );
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
