import type {
  ID,
} from "./types";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import type {
  BudgetUsage,
} from "./budget-authority";

export interface ModelBudgetLimits {
  maxTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxEstimatedCost: number;
  maxRequests: number;
}

export interface ModelBudgetUsage {
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface ModelBudgetDecision {
  allowed: boolean;
  reason: string;
  remaining: ModelBudgetLimits;
}

type DetailedBudgetUsage = BudgetUsage & {
  inputTokens?: number;
  outputTokens?: number;
};

function usageBreakdown(usage: DetailedBudgetUsage): {
  inputTokens: number;
  outputTokens: number;
} {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return { inputTokens, outputTokens };
}

export class ModelBudgetEnforcer {
  private readonly usage = new Map<ID, ModelBudgetUsage>();

  constructor(private readonly limits: ModelBudgetLimits) {
    this.validateLimits(limits);
  }

  getUsage(scopeId: ID): ModelBudgetUsage {
    const usage = this.usage.get(scopeId);
    if (!usage) {
      return {
        requests: 0,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      };
    }
    return { ...usage };
  }

  check(
    scopeId: ID,
    usage: DetailedBudgetUsage,
  ): ModelBudgetDecision {
    this.validateUsage(usage);

    const current = this.getUsage(scopeId);
    const detail = usageBreakdown(usage);
    const projected: ModelBudgetUsage = {
      requests: current.requests + 1,
      tokens: current.tokens + usage.tokensUsed,
      inputTokens: current.inputTokens + detail.inputTokens,
      outputTokens: current.outputTokens + detail.outputTokens,
      estimatedCost: current.estimatedCost + (usage.estimatedCost ?? 0),
    };

    const violations: string[] = [];
    if (projected.requests > this.limits.maxRequests) {
      violations.push("request quota exceeded");
    }
    if (projected.tokens > this.limits.maxTokens) {
      violations.push("token quota exceeded");
    }
    if (projected.inputTokens > this.limits.maxInputTokens) {
      violations.push("input token quota exceeded");
    }
    if (projected.outputTokens > this.limits.maxOutputTokens) {
      violations.push("output token quota exceeded");
    }
    if (projected.estimatedCost > this.limits.maxEstimatedCost) {
      violations.push("cost quota exceeded");
    }

    if (violations.length > 0) {
      return {
        allowed: false,
        reason: violations.join("; "),
        remaining: this.remaining(current),
      };
    }

    return {
      allowed: true,
      reason: "Projected model usage remains within budget.",
      remaining: this.remaining(current),
    };
  }

  record(
    scopeId: ID,
    usage: DetailedBudgetUsage,
  ): void {
    const decision = this.check(scopeId, usage);
    if (!decision.allowed) {
      throw new Error(
        `K.I.N.G.S. Model Budget Enforcer: ${decision.reason}`,
      );
    }

    const current = this.getUsage(scopeId);
    const detail = usageBreakdown(usage);
    this.usage.set(scopeId, {
      requests: current.requests + 1,
      tokens: current.tokens + usage.tokensUsed,
      inputTokens: current.inputTokens + detail.inputTokens,
      outputTokens: current.outputTokens + detail.outputTokens,
      estimatedCost: current.estimatedCost + (usage.estimatedCost ?? 0),
    });
  }

  authorizeRequest(
    scopeId: ID,
    request: ModelExecutionRequest,
  ): ModelBudgetDecision {
    const current = this.getUsage(scopeId);
    const requestedOutput = request.maxOutputTokens ?? 0;

    if (requestedOutput > this.limits.maxOutputTokens) {
      return {
        allowed: false,
        reason: "requested output token limit exceeds model budget.",
        remaining: this.remaining(current),
      };
    }
    if (requestedOutput > this.remaining(current).maxOutputTokens) {
      return {
        allowed: false,
        reason: "requested output token limit exceeds remaining output token budget.",
        remaining: this.remaining(current),
      };
    }
    if (current.requests >= this.limits.maxRequests) {
      return {
        allowed: false,
        reason: "request quota already exhausted.",
        remaining: this.remaining(current),
      };
    }
    if (current.tokens >= this.limits.maxTokens) {
      return {
        allowed: false,
        reason: "token quota already exhausted.",
        remaining: this.remaining(current),
      };
    }
    if (current.inputTokens >= this.limits.maxInputTokens) {
      return {
        allowed: false,
        reason: "input token quota already exhausted.",
        remaining: this.remaining(current),
      };
    }
    if (current.outputTokens >= this.limits.maxOutputTokens) {
      return {
        allowed: false,
        reason: "output token quota already exhausted.",
        remaining: this.remaining(current),
      };
    }
    if (current.estimatedCost >= this.limits.maxEstimatedCost) {
      return {
        allowed: false,
        reason: "cost quota already exhausted.",
        remaining: this.remaining(current),
      };
    }

    return {
      allowed: true,
      reason: "Model request is within current budget authority.",
      remaining: this.remaining(current),
    };
  }

  executeWithinBudget(
    scopeId: ID,
    request: ModelExecutionRequest,
    execute: () => Promise<ModelExecutionResult>,
  ): Promise<ModelExecutionResult> {
    const authorization = this.authorizeRequest(scopeId, request);
    if (!authorization.allowed) {
      const timestamp = new Date().toISOString();
      return Promise.resolve({
        success: false,
        failure: {
          requestId: request.id,
          providerId: "budget-authority",
          modelId: "budget-authority",
          retryable: false,
          code: "BUDGET_EXCEEDED",
          message: authorization.reason,
          metadata: {
            requestId: request.id,
            startedAt: timestamp,
            completedAt: timestamp,
            latencyMs: 0,
          },
        },
      });
    }

    return execute().then((result) => {
      if (result.success && result.response) {
        this.record(scopeId, result.response.usage);
      }
      return result;
    });
  }

  private remaining(usage: ModelBudgetUsage): ModelBudgetLimits {
    return {
      maxTokens: Math.max(0, this.limits.maxTokens - usage.tokens),
      maxInputTokens: Math.max(
        0,
        this.limits.maxInputTokens - usage.inputTokens,
      ),
      maxOutputTokens: Math.max(
        0,
        this.limits.maxOutputTokens - usage.outputTokens,
      ),
      maxEstimatedCost: Math.max(
        0,
        this.limits.maxEstimatedCost - usage.estimatedCost,
      ),
      maxRequests: Math.max(0, this.limits.maxRequests - usage.requests),
    };
  }

  private validateLimits(limits: ModelBudgetLimits): void {
    const values = [
      limits.maxTokens,
      limits.maxInputTokens,
      limits.maxOutputTokens,
      limits.maxEstimatedCost,
      limits.maxRequests,
    ];
    if (
      values.some((value) =>
        !Number.isFinite(value) || value < 0,
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Model Budget Enforcer: budget limits must be finite non-negative values.",
      );
    }
  }

  private validateUsage(usage: DetailedBudgetUsage): void {
    if (!Number.isFinite(usage.tokensUsed) || usage.tokensUsed < 0) {
      throw new Error(
        "K.I.N.G.S. Model Budget Enforcer: invalid token usage.",
      );
    }
    if (
      !Number.isFinite(usage.estimatedCost ?? 0) ||
      (usage.estimatedCost ?? 0) < 0
    ) {
      throw new Error(
        "K.I.N.G.S. Model Budget Enforcer: invalid estimated cost.",
      );
    }
    const detail = usageBreakdown(usage);
    if (!Number.isFinite(detail.inputTokens) || detail.inputTokens < 0) {
      throw new Error(
        "K.I.N.G.S. Model Budget Enforcer: invalid input token usage.",
      );
    }
    if (!Number.isFinite(detail.outputTokens) || detail.outputTokens < 0) {
      throw new Error(
        "K.I.N.G.S. Model Budget Enforcer: invalid output token usage.",
      );
    }
    if (detail.inputTokens + detail.outputTokens > usage.tokensUsed) {
      throw new Error(
        "K.I.N.G.S. Model Budget Enforcer: input + output tokens cannot exceed total tokens used.",
      );
    }
  }
}
