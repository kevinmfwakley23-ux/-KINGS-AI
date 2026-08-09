import type {
  Evidence,
  KnowledgeRecord,
  MemoryQuery,
  MemoryResult,
} from "./types";

import type {
  KnowledgeRegistry,
} from "./knowledge-registry";

export class KnowledgeRetrieval {
  constructor(
    private readonly registry: KnowledgeRegistry,
  ) {}

  retrieve(query: MemoryQuery): MemoryResult {
    const normalizedQuery = [
      ...new Set(
        query.query
          .toLowerCase()
          .match(/[a-z0-9]+/g) ?? [],
      ),
    ];

    const sourceFilter = query.sourceIds
      ? new Set(query.sourceIds)
      : undefined;

    const memoryTypeFilter = query.memoryTypes
      ? new Set(query.memoryTypes)
      : undefined;

    const candidates = this.registry
      .listRecords()
      .filter((record) => {
        if (
          sourceFilter &&
          !sourceFilter.has(record.sourceId)
        ) {
          return false;
        }

        if (
          memoryTypeFilter &&
          !memoryTypeFilter.has(record.memoryType)
        ) {
          return false;
        }

        if (
          query.authoritativeOnly &&
          !record.authoritative
        ) {
          return false;
        }

        return true;
      })
      .map((record) => ({
        record,
        score: this.score(record, normalizedQuery),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    const limit = Math.max(
      1,
      query.limit ?? candidates.length,
    );

    const records = candidates
      .slice(0, limit)
      .map((candidate) => candidate.record);

    const evidenceMap = new Map<string, Evidence>();

    for (const record of records) {
      for (const evidenceId of record.evidenceIds) {
        const evidence = this.registry.getEvidence(evidenceId);

        if (evidence) {
          evidenceMap.set(evidence.id, evidence);
        }
      }
    }

    const evidence = [...evidenceMap.values()];

    const sourceIds = [
      ...new Set(records.map((record) => record.sourceId)),
    ];

    return {
      query: query.query,
      records,
      evidence,
      sourceIds,
      createdAt: new Date().toISOString(),
    };
  }

  private score(
    record: KnowledgeRecord,
    queryTerms: string[],
  ): number {
    if (queryTerms.length === 0) {
      return 0;
    }

    const searchableText = [
      record.summary,
      record.content ?? "",
    ]
      .join(" ")
      .toLowerCase();

    const words = new Set(
      searchableText.match(/[a-z0-9]+/g) ?? [],
    );

    const allTermsMatch = queryTerms.every(
      (term) => words.has(term),
    );

    if (!allTermsMatch) {
      return 0;
    }

    let score = queryTerms.length;

    if (record.authoritative) {
      score += 0.25;
    }

    return score;
  }
}
