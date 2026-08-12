import type {
  ID,
  MemoryReference,
  MemoryResult,
  MemoryType,
  Task,
} from "../types";

import {
  MissionMemoryBridge,
} from "../mission-memory-bridge";

import type {
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import {
  MemoryRelevanceRanker,
} from "./memory-relevance-ranker";

export interface MissionContextRetrievalLimits {
  maxMemories: number;
  maxKnowledgeRecords: number;
  maxEvidence: number;
}

export interface MissionContextPackage {
  missionId: ID;
  taskId: ID;
  memories: MemoryReference[];
  knowledge?: MemoryResult;
}

export class MissionContextRetriever {
  constructor(
    private readonly missionMemory:
      MissionMemoryBridge,
    private readonly knowledgeRuntime?:
      KnowledgeRuntimeAdapter,
    private readonly limits:
      MissionContextRetrievalLimits = {
        maxMemories: 20,
        maxKnowledgeRecords: 20,
        maxEvidence: 40,
      },
    private readonly relevanceRanker:
      MemoryRelevanceRanker =
        new MemoryRelevanceRanker(),
  ) {
    if (
      !Number.isInteger(
        limits.maxMemories,
      ) ||
      limits.maxMemories < 0 ||
      !Number.isInteger(
        limits.maxKnowledgeRecords,
      ) ||
      limits.maxKnowledgeRecords < 0 ||
      !Number.isInteger(
        limits.maxEvidence,
      ) ||
      limits.maxEvidence < 0
    ) {
      throw new Error(
        "K.I.N.G.S. Mission Context Retriever: limits must be non-negative integers",
      );
    }
  }

  async retrieve(
    task: Task,
  ): Promise<MissionContextPackage> {
    const memories =
      this.retrieveMemories(
        task,
      );

    const knowledge =
      await this.retrieveKnowledge(
        task,
      );

    return {
      missionId:
        task.missionId,
      taskId:
        task.id,
      memories,
      knowledge,
    };
  }

  private retrieveMemories(
    task: Task,
  ): MemoryReference[] {
    const memories =
      this.missionMemory.getMissionMemories(
        task.missionId,
      );

    const taskRelevant =
      memories.filter(
        (memory) =>
          this.matchesTask(
            memory,
            task,
          ),
      );

    return this.relevanceRanker
      .rank(
        task,
        taskRelevant,
        this.limits.maxMemories,
      )
      .map(
        (item) => ({
          ...item.memory,
          sourceReferences: [
            ...item.memory.sourceReferences,
          ],
        }),
      );
  }

  private async retrieveKnowledge(
    task: Task,
  ): Promise<MemoryResult | undefined> {
    if (
      !task.knowledgeQuery
    ) {
      return undefined;
    }

    if (
      !this.knowledgeRuntime
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Context Retriever: task "${task.id}" requires knowledge retrieval but no knowledge runtime is configured`,
      );
    }

    const result =
      await this.knowledgeRuntime.retrieve(
        {
          ...task.knowledgeQuery,
          limit:
            Math.min(
              task.knowledgeQuery.limit ??
                this.limits.maxKnowledgeRecords,
              this.limits.maxKnowledgeRecords,
            ),
        },
      );

    const records =
      result.records
        .slice(
          0,
          this.limits.maxKnowledgeRecords,
        )
        .map(
          (record) => ({
            ...record,
            evidenceIds: [
              ...record.evidenceIds,
            ],
          }),
        );

    const evidence =
      result.evidence
        .slice(
          0,
          this.limits.maxEvidence,
        )
        .map(
          (item) => ({
            ...item,
          }),
        );

    return {
      ...result,
      records,
      evidence,
      sourceIds: [
        ...new Set(
          records.map(
            (record) =>
              record.sourceId,
          ),
        ),
      ],
    };
  }

  private matchesTask(
    memory: MemoryReference,
    task: Task,
  ): boolean {
    if (
      memory.missionId !==
      task.missionId
    ) {
      return false;
    }

    if (
      memory.taskId &&
      memory.taskId !== task.id
    ) {
      return false;
    }

    if (
      task.inputReferences.length === 0
    ) {
      return true;
    }

    return memory.sourceReferences.some(
      (reference) =>
        task.inputReferences.includes(
          reference,
        ),
    );
  }
}
