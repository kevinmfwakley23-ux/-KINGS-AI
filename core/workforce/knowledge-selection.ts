import type {
  ID,
  MemoryResult,
  Task,
} from "./types";

import {
  KnowledgeRetrieval,
} from "./knowledge-retrieval";

export interface KnowledgeSelectionLimits {
  maxRecords: number;
  maxEvidence: number;
}

export interface KnowledgeSelectionDecision {
  selected: boolean;
  taskId: ID;
  query?: string;
  result?: MemoryResult;
}

export class KnowledgeSelectionAuthority {
  constructor(
    private readonly retrieval: KnowledgeRetrieval,
    private readonly limits: KnowledgeSelectionLimits = {
      maxRecords: 20,
      maxEvidence: 40,
    },
  ) {
    if (
      !Number.isInteger(limits.maxRecords) ||
      limits.maxRecords < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Knowledge Selection: maxRecords must be a positive integer",
      );
    }

    if (
      !Number.isInteger(limits.maxEvidence) ||
      limits.maxEvidence < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Knowledge Selection: maxEvidence must be a positive integer",
      );
    }
  }

  select(
    task: Task,
  ): KnowledgeSelectionDecision {
    if (!task.id) {
      throw new Error(
        "K.I.N.G.S. Knowledge Selection: task id is required",
      );
    }

    if (!task.knowledgeQuery) {
      return {
        selected: false,
        taskId: task.id,
      };
    }

    const query = task.knowledgeQuery.query.trim();

    if (!query) {
      throw new Error(
        `K.I.N.G.S. Knowledge Selection: task "${task.id}" requires a non-empty knowledge query`,
      );
    }

    const requestedLimit =
      task.knowledgeQuery.limit ??
      this.limits.maxRecords;

    const limit = Math.min(
      Math.max(1, requestedLimit),
      this.limits.maxRecords,
    );

    const result =
      this.retrieval.retrieve({
        ...task.knowledgeQuery,
        query,
        limit,
        authoritativeOnly: true,
      });

    const records =
      result.records.slice(
        0,
        this.limits.maxRecords,
      );

    const retainedEvidenceIds =
      new Set<string>(
        records.flatMap(
          (record) =>
            record.evidenceIds,
        ),
      );

    const evidence =
      result.evidence
        .filter(
          (item) =>
            retainedEvidenceIds.has(item.id),
        )
        .slice(
          0,
          this.limits.maxEvidence,
        );

    const evidenceIds =
      new Set(
        evidence.map(
          (item) =>
            item.id,
        ),
      );

    const filteredRecords =
      records.map(
        (record) => ({
          ...record,
          evidenceIds:
            record.evidenceIds.filter(
              (evidenceId) =>
                evidenceIds.has(
                  evidenceId,
                ),
            ),
        }),
      );

    const sourceIds = [
      ...new Set(
        filteredRecords.map(
          (record) =>
            record.sourceId,
        ),
      ),
    ];

    return {
      selected:
        filteredRecords.length > 0,
      taskId:
        task.id,
      query,
      result: {
        ...result,
        query,
        records:
          filteredRecords,
        evidence,
        sourceIds,
      },
    };
  }
}
