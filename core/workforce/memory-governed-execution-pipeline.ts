import type {
  MemoryReference,
  MemoryResult,
  Task,
} from "./types";

import {
  MissionContextRetriever,
  type MissionContextPackage,
} from "./execution/mission-context-retriever";

import {
  createMissionExecutionContext,
} from "./execution/mission-execution-context";

import {
  MemoryIntegrityAuthority,
} from "./memory-integrity-authority";

import {
  MemoryRetrievalQualityAuthority,
} from "./memory-retrieval-quality";

import {
  MemoryContextBudgetAuthority,
} from "./memory-context-budget";

export interface GovernedMemoryExecutionPipelineOptions {
  now:
    string;

  memoryBudgetTokens:
    number;

  minimumRetrievalQuality:
    number;

  supersededMemoryIds?:
    string[];

  knownMissionIds?:
    string[];

  knownTaskIds?:
    string[];

  knownSourceIds?:
    string[];
}

export interface GovernedMemoryExecutionResult {
  taskId:
    string;

  missionId:
    string;

  retrievedMemoryCount:
    number;

  verifiedMemoryCount:
    number;

  selectedMemoryIds:
    string[];

  rejectedMemoryIds:
    string[];

  estimatedContextTokens:
    number;

  remainingContextTokens:
    number;

  executionContext:
    ReturnType<
      typeof createMissionExecutionContext
    >;
}

export class GovernedMemoryExecutionPipeline {
  constructor(
    private readonly contextRetriever:
      MissionContextRetriever,

    private readonly integrity:
      MemoryIntegrityAuthority =
        new MemoryIntegrityAuthority(),

    private readonly retrievalQuality:
      MemoryRetrievalQualityAuthority =
        new MemoryRetrievalQualityAuthority(),

    private readonly budget:
      MemoryContextBudgetAuthority =
        new MemoryContextBudgetAuthority(),
  ) {}

  async build(
    task:
      Task,

    agent:
      Parameters<
        typeof createMissionExecutionContext
      >[0]["agent"],

    options:
      GovernedMemoryExecutionPipelineOptions,
  ):
    Promise<
      GovernedMemoryExecutionResult
    > {
    const missionContext:
      MissionContextPackage =
      await this.contextRetriever.retrieve(
        task,
      );

    const verifiedMemories:
      MemoryReference[] = [];

    for (
      const memory of
        missionContext.memories
    ) {
      const integrityResult =
        this.integrity.verify(
          memory,
          {
            knownMissionIds:
              options.knownMissionIds,

            knownTaskIds:
              options.knownTaskIds,

            knownSourceIds:
              options.knownSourceIds,

            supersededMemoryIds:
              options.supersededMemoryIds,
          },
        );

      if (
        integrityResult.status ===
        "valid"
      ) {
        verifiedMemories.push(
          memory,
        );
      }
    }

    const qualityResult =
      this.retrievalQuality.evaluate(
        task,
        verifiedMemories,
        {
          now:
            options.now,

          limit:
            verifiedMemories.length,

          minimumQuality:
            options.minimumRetrievalQuality,

          supersededMemoryIds:
            options.supersededMemoryIds,
        },
      );

    const qualitySelected =
      new Set(
        qualityResult.selectedMemoryIds,
      );

    const qualityMemories =
      verifiedMemories.filter(
        (
          memory,
        ) =>
          qualitySelected.has(
            memory.id,
          ),
      );

    const budgetResult =
      this.budget.calculate({
        memories:
          qualityMemories,

        knowledge:
          missionContext.knowledge,

        budgetTokens:
          options.memoryBudgetTokens,
      });

    const budgetSelected =
      new Set(
        budgetResult.selectedMemoryIds,
      );

    const finalMemories =
      qualityMemories.filter(
        (
          memory,
        ) =>
          budgetSelected.has(
            memory.id,
          ),
      );

    const finalKnowledge:
      MemoryResult |
      undefined =
      missionContext.knowledge
        ? {
            ...missionContext.knowledge,

            records:
              missionContext.knowledge.records.filter(
                (
                  record,
                ) =>
                  budgetResult.selectedKnowledgeIds.includes(
                    record.id,
                  ),
              ),

            evidence:
              missionContext.knowledge.evidence,

            sourceIds:
              [
                ...missionContext.knowledge.sourceIds,
              ],
          }
        : undefined;

    const executionContext =
      createMissionExecutionContext({
        missionId:
          missionContext.missionId,

        taskId:
          missionContext.taskId,

        agent,

        task,

        memories:
          finalMemories,

        knowledge:
          finalKnowledge,
      });

    return {
      taskId:
        task.id,

      missionId:
        task.missionId,

      retrievedMemoryCount:
        missionContext.memories.length,

      verifiedMemoryCount:
        verifiedMemories.length,

      selectedMemoryIds:
        finalMemories.map(
          (
            memory,
          ) =>
            memory.id,
        ),

      rejectedMemoryIds:
        missionContext.memories
          .filter(
            (
              memory,
            ) =>
              !finalMemories.some(
                (
                  selected,
                ) =>
                  selected.id ===
                  memory.id,
              ),
          )
          .map(
            (
              memory,
            ) =>
              memory.id,
          ),

      estimatedContextTokens:
        budgetResult.estimatedUsedTokens,

      remainingContextTokens:
        budgetResult.estimatedRemainingTokens,

      executionContext,
    };
  }
}
