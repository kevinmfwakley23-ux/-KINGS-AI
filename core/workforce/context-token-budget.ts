import type { Evidence, KnowledgeRecord, MemoryResult } from "./types";

export interface ContextTokenBudgetLimits {
  maxEstimatedTokens: number;
  charactersPerToken: number;
  recordOverheadTokens: number;
  evidenceOverheadTokens: number;
}

export interface ContextTokenBudgetResult {
  knowledge: MemoryResult;
  estimatedOriginalTokens: number;
  estimatedOptimizedTokens: number;
  estimatedTokensSaved: number;
  droppedRecordIds: string[];
  trimmedRecordContentIds: string[];
  trimmedEvidenceExcerptIds: string[];
}

export class ContextTokenBudgetPlanner {
  constructor(
    private readonly limits: ContextTokenBudgetLimits = {
      maxEstimatedTokens: 8_000,
      charactersPerToken: 4,
      recordOverheadTokens: 12,
      evidenceOverheadTokens: 8,
    },
  ) {
    if (!Number.isFinite(limits.maxEstimatedTokens) || limits.maxEstimatedTokens < 1) throw new Error("K.I.N.G.S. Context Token Budget: maxEstimatedTokens must be at least 1");
    if (!Number.isFinite(limits.charactersPerToken) || limits.charactersPerToken < 1) throw new Error("K.I.N.G.S. Context Token Budget: charactersPerToken must be at least 1");
    if (!Number.isFinite(limits.recordOverheadTokens) || limits.recordOverheadTokens < 0) throw new Error("K.I.N.G.S. Context Token Budget: record overhead cannot be negative");
    if (!Number.isFinite(limits.evidenceOverheadTokens) || limits.evidenceOverheadTokens < 0) throw new Error("K.I.N.G.S. Context Token Budget: evidence overhead cannot be negative");
  }

  plan(knowledge: MemoryResult): ContextTokenBudgetResult {
    const estimatedOriginalTokens = this.estimateKnowledge(knowledge);
    if (estimatedOriginalTokens <= this.limits.maxEstimatedTokens) {
      return {
        knowledge,
        estimatedOriginalTokens,
        estimatedOptimizedTokens: estimatedOriginalTokens,
        estimatedTokensSaved: 0,
        droppedRecordIds: [],
        trimmedRecordContentIds: [],
        trimmedEvidenceExcerptIds: [],
      };
    }

    let usedTokens = this.estimateText(knowledge.query);
    const droppedRecordIds: string[] = [];
    const trimmedRecordContentIds: string[] = [];
    const trimmedEvidenceExcerptIds: string[] = [];
    const selected = new Map<string, KnowledgeRecord>();

    const prioritized = knowledge.records
      .map((record, index) => ({ record, index }))
      .sort((left, right) => {
        if (left.record.authoritative !== right.record.authoritative) return left.record.authoritative ? -1 : 1;
        return left.index - right.index;
      });

    for (const { record } of prioritized) {
      const minimalRecord: KnowledgeRecord = { ...record, content: undefined, evidenceIds: [...record.evidenceIds] };
      const minimalCost = this.estimateRecord(minimalRecord);
      if (usedTokens + minimalCost > this.limits.maxEstimatedTokens) {
        droppedRecordIds.push(record.id);
        continue;
      }

      let retained = minimalRecord;
      usedTokens += minimalCost;

      if (record.content !== undefined) {
        const contentCost = this.estimateText(record.content);
        if (usedTokens + contentCost <= this.limits.maxEstimatedTokens) {
          retained = { ...minimalRecord, content: record.content };
          usedTokens += contentCost;
        } else {
          trimmedRecordContentIds.push(record.id);
        }
      }

      selected.set(record.id, retained);
    }

    const evidenceById = new Map(knowledge.evidence.map((item) => [item.id, item]));
    const selectedEvidence = new Map<string, Evidence>();
    const requestedEvidenceIds = new Set(
      Array.from(selected.values()).flatMap((record) => record.evidenceIds),
    );

    for (const evidence of knowledge.evidence) {
      if (!requestedEvidenceIds.has(evidence.id)) continue;

      const minimalEvidence: Evidence = { ...evidence, excerpt: undefined };
      const minimalCost = this.estimateEvidence(minimalEvidence);
      if (usedTokens + minimalCost > this.limits.maxEstimatedTokens) continue;

      let retained = minimalEvidence;
      usedTokens += minimalCost;

      if (evidence.excerpt !== undefined) {
        const excerptCost = this.estimateText(evidence.excerpt);
        if (usedTokens + excerptCost <= this.limits.maxEstimatedTokens) {
          retained = { ...minimalEvidence, excerpt: evidence.excerpt };
          usedTokens += excerptCost;
        } else {
          trimmedEvidenceExcerptIds.push(evidence.id);
        }
      }

      selectedEvidence.set(evidence.id, retained);
    }

    const records = knowledge.records
      .filter((record) => selected.has(record.id))
      .map((record) => {
        const retained = selected.get(record.id)!;
        return {
          ...retained,
          evidenceIds: retained.evidenceIds.filter((evidenceId) => selectedEvidence.has(evidenceId) && evidenceById.has(evidenceId)),
        };
      });

    const evidence = knowledge.evidence
      .filter((item) => selectedEvidence.has(item.id))
      .map((item) => selectedEvidence.get(item.id)!);

    const sourceIds = [...new Set([...records.map((record) => record.sourceId), ...evidence.map((item) => item.sourceId)])];
    const optimized: MemoryResult = { ...knowledge, records, evidence, sourceIds };
    const estimatedOptimizedTokens = this.estimateKnowledge(optimized);

    return {
      knowledge: optimized,
      estimatedOriginalTokens,
      estimatedOptimizedTokens,
      estimatedTokensSaved: Math.max(0, estimatedOriginalTokens - estimatedOptimizedTokens),
      droppedRecordIds,
      trimmedRecordContentIds,
      trimmedEvidenceExcerptIds,
    };
  }

  estimateKnowledge(knowledge: MemoryResult): number {
    return this.estimateText(knowledge.query)
      + knowledge.records.reduce((sum, record) => sum + this.estimateRecord(record), 0)
      + knowledge.evidence.reduce((sum, evidence) => sum + this.estimateEvidence(evidence), 0);
  }

  estimateText(value: string | undefined): number {
    if (!value) return 0;
    return Math.ceil(value.length / this.limits.charactersPerToken);
  }

  private estimateRecord(record: KnowledgeRecord): number {
    return this.limits.recordOverheadTokens
      + this.estimateText(record.id)
      + this.estimateText(record.sourceId)
      + this.estimateText(record.summary)
      + this.estimateText(record.content)
      + record.evidenceIds.reduce((sum, id) => sum + this.estimateText(id), 0);
  }

  private estimateEvidence(evidence: Evidence): number {
    return this.limits.evidenceOverheadTokens
      + this.estimateText(evidence.id)
      + this.estimateText(evidence.sourceId)
      + this.estimateText(evidence.description)
      + this.estimateText(evidence.location)
      + this.estimateText(evidence.excerpt);
  }
}
