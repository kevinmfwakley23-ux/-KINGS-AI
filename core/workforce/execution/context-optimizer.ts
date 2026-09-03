import type {
  Evidence,
  KnowledgeRecord,
  MemoryResult,
} from "../types";

import {
  ContextTokenBudgetPlanner,
} from "../context-token-budget";

import type {
  AgentExecutionContext,
} from "./adapter";

export interface ContextOptimizationLimits {
  maxRecords: number;
  maxEvidence: number;
  maxEstimatedTokens?: number;
  charactersPerToken?: number;
}

export class ExecutionContextOptimizer {
  constructor(
    private readonly limits: ContextOptimizationLimits = {
      maxRecords: 20,
      maxEvidence: 40,
      maxEstimatedTokens: 8_000,
      charactersPerToken: 4,
    },
  ) {
    if (limits.maxRecords < 1) {
      throw new Error(
        "K.I.N.G.S. Context Optimizer: maxRecords must be at least 1",
      );
    }

    if (limits.maxEvidence < 1) {
      throw new Error(
        "K.I.N.G.S. Context Optimizer: maxEvidence must be at least 1",
      );
    }

    if (
      limits.maxEstimatedTokens !== undefined &&
      (!Number.isFinite(limits.maxEstimatedTokens) || limits.maxEstimatedTokens < 1)
    ) {
      throw new Error(
        "K.I.N.G.S. Context Optimizer: maxEstimatedTokens must be at least 1",
      );
    }

    if (
      limits.charactersPerToken !== undefined &&
      (!Number.isFinite(limits.charactersPerToken) || limits.charactersPerToken < 1)
    ) {
      throw new Error(
        "K.I.N.G.S. Context Optimizer: charactersPerToken must be at least 1",
      );
    }
  }

  optimize(
    context: AgentExecutionContext,
  ): AgentExecutionContext {
    if (!context.knowledge) {
      return context;
    }

    return {
      ...context,
      knowledge: this.optimizeKnowledge(
        context.knowledge,
      ),
    };
  }

  private optimizeKnowledge(
    knowledge: MemoryResult,
  ): MemoryResult {
    const records: KnowledgeRecord[] =
      knowledge.records.slice(
        0,
        this.limits.maxRecords,
      );

    const retainedEvidenceIds =
      new Set<string>(
        records.flatMap(
          (record: KnowledgeRecord) =>
            record.evidenceIds,
        ),
      );

    const evidence: Evidence[] =
      knowledge.evidence
        .filter(
          (item: Evidence) =>
            retainedEvidenceIds.has(item.id),
        )
        .slice(
          0,
          this.limits.maxEvidence,
        );

    const evidenceIds =
      new Set<string>(
        evidence.map(
          (item: Evidence) => item.id,
        ),
      );

    const filteredRecords: KnowledgeRecord[] =
      records.map(
        (record: KnowledgeRecord) => ({
          ...record,
          evidenceIds:
            record.evidenceIds.filter(
              (evidenceId: string) =>
                evidenceIds.has(evidenceId),
            ),
        }),
      );

    const sourceIds = [
      ...new Set(
        filteredRecords.map(
          (record: KnowledgeRecord) =>
            record.sourceId,
        ),
      ),
    ];

    const optimized: MemoryResult = {
      ...knowledge,
      records: filteredRecords,
      evidence,
      sourceIds,
    };

    if (this.limits.maxEstimatedTokens === undefined) {
      return optimized;
    }

    const tokenBudget = new ContextTokenBudgetPlanner({
      maxEstimatedTokens: this.limits.maxEstimatedTokens,
      charactersPerToken: this.limits.charactersPerToken ?? 4,
      recordOverheadTokens: 12,
      evidenceOverheadTokens: 8,
    });

    return tokenBudget.plan(optimized).knowledge;
  }
}
