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
  ) {
    if (
      limits.maxMemories < 1 ||
      limits.maxKnowledgeRecords < 1 ||
      limits.maxEvidence < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Mission Context Retriever: limits must be at least 1",
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

    const authoritative =
      memories.filter(
        (memory) =>
          memory.authoritative,
      );

    const ordinary =
      memories.filter(
        (memory) =>
          !memory.authoritative,
      );

    return [
      ...authoritative,
      ...ordinary,
    ]
      .filter(
        (memory) =>
          this.matchesTask(
            memory,
            task,
          ),
      )
      .slice(
        0,
        this.limits.maxMemories,
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

    return {
      ...result,
      records:
        result.records.slice(
          0,
          this.limits.maxKnowledgeRecords,
        ),
      evidence:
        result.evidence.slice(
          0,
          this.limits.maxEvidence,
        ),
      sourceIds: [
        ...new Set(
          result.records
            .slice(
              0,
              this.limits.maxKnowledgeRecords,
            )
            .map(
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
