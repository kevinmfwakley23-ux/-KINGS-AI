export type ContextValuePriority =
  | "high"
  | "medium"
  | "low";

export interface ContextBudget {
  maxTokens: number;
}

export interface ContextSegment {
  id: string;
  estimatedTokens: number;
  priority: ContextValuePriority;
  optimizable: boolean;
}

export interface ContextBudgetInput {
  budget: ContextBudget;
  segments: readonly ContextSegment[];
  currentTokens?: number;
}

export interface ContextBudgetDecision {
  allowed: boolean;
  currentTokens: number;
  budgetTokens: number;
  overageTokens: number;
  optimizationRequired: boolean;
  targetTokens: number;
  tokensToRemove: number;
  reason: string;
}

export interface ContextReductionCandidate {
  id: string;
  priority: ContextValuePriority;
  estimatedTokens: number;
  removableTokens: number;
  optimizable: boolean;
}

export interface ContextBudgetPlan {
  decision: ContextBudgetDecision;
  candidates: ContextReductionCandidate[];
  plannedReductionTokens: number;
  projectedTokens: number;
  targetReached: boolean;
}

export class ContextBudgetAuthority {
  constructor(
    private readonly minimumBudgetTokens:
      number = 1,
  ) {
    if (
      !Number.isInteger(
        minimumBudgetTokens,
      ) ||
      minimumBudgetTokens < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Context Budget: minimum budget must be a positive integer",
      );
    }
  }

  estimateTokens(
    content: string,
  ): number {
    if (!content) {
      return 0;
    }

    const characters =
      content.length;

    return Math.max(
      1,
      Math.ceil(
        characters / 4,
      ),
    );
  }

  validateBudget(
    budget: ContextBudget,
  ): void {
    if (
      !Number.isInteger(
        budget.maxTokens,
      ) ||
      budget.maxTokens <
        this.minimumBudgetTokens
    ) {
      throw new Error(
        "K.I.N.G.S. Context Budget: maxTokens must be a positive integer",
      );
    }
  }

  evaluate(
    input: ContextBudgetInput,
  ): ContextBudgetDecision {
    this.validateBudget(
      input.budget,
    );

    const currentTokens =
      input.currentTokens ??
      this.sumTokens(
        input.segments,
      );

    if (
      !Number.isFinite(
        currentTokens,
      ) ||
      currentTokens < 0
    ) {
      throw new Error(
        "K.I.N.G.S. Context Budget: current token count must be non-negative",
      );
    }

    const budgetTokens =
      input.budget.maxTokens;

    const overageTokens =
      Math.max(
        0,
        currentTokens -
          budgetTokens,
      );

    const optimizationRequired =
      overageTokens > 0;

    if (
      !optimizationRequired
    ) {
      return {
        allowed: true,
        currentTokens,
        budgetTokens,
        overageTokens: 0,
        optimizationRequired:
          false,
        targetTokens:
          currentTokens,
        tokensToRemove: 0,
        reason:
          "Context is within budget; optimization is not required.",
      };
    }

    return {
      allowed: false,
      currentTokens,
      budgetTokens,
      overageTokens,
      optimizationRequired:
        true,
      targetTokens:
        budgetTokens,
      tokensToRemove:
        overageTokens,
      reason:
        `Context exceeds budget by ${overageTokens} tokens.`,
    };
  }

  plan(
    input: ContextBudgetInput,
  ): ContextBudgetPlan {
    const decision =
      this.evaluate(
        input,
      );

    if (
      !decision.optimizationRequired
    ) {
      return {
        decision,
        candidates: [],
        plannedReductionTokens:
          0,
        projectedTokens:
          decision.currentTokens,
        targetReached:
          true,
      };
    }

    const candidates =
      input.segments
        .filter(
          (segment) =>
            segment.optimizable &&
            segment.estimatedTokens >
              0,
        )
        .map(
          (
            segment,
          ): ContextReductionCandidate => ({
            id:
              segment.id,
            priority:
              segment.priority,
            estimatedTokens:
              segment.estimatedTokens,
            removableTokens:
              segment.estimatedTokens,
            optimizable:
              segment.optimizable,
          }),
        )
        .sort(
          (
            left,
            right,
          ) => {
            const priorityDifference =
              this.priorityRank(
                left.priority,
              ) -
              this.priorityRank(
                right.priority,
              );

            if (
              priorityDifference !==
              0
            ) {
              return priorityDifference;
            }

            if (
              left.estimatedTokens !==
              right.estimatedTokens
            ) {
              return (
                right.estimatedTokens -
                left.estimatedTokens
              );
            }

            return left.id.localeCompare(
              right.id,
            );
          },
        );

    let remaining =
      decision.tokensToRemove;

    let plannedReductionTokens =
      0;

    const selected:
      ContextReductionCandidate[] =
      [];

    for (
      const candidate of
        candidates
    ) {
      if (
        remaining <= 0
      ) {
        break;
      }

      const removable =
        Math.min(
          candidate.removableTokens,
          remaining,
        );

      if (
        removable <= 0
      ) {
        continue;
      }

      selected.push({
        ...candidate,
        removableTokens:
          removable,
      });

      plannedReductionTokens +=
        removable;

      remaining -=
        removable;
    }

    const projectedTokens =
      Math.max(
        0,
        decision.currentTokens -
          plannedReductionTokens,
      );

    return {
      decision,
      candidates:
        selected,
      plannedReductionTokens,
      projectedTokens,
      targetReached:
        projectedTokens <=
        decision.budgetTokens,
    };
  }

  private sumTokens(
    segments: readonly ContextSegment[],
  ): number {
    return segments.reduce(
      (
        total,
        segment,
      ) => {
        if (
          !Number.isFinite(
            segment.estimatedTokens,
          ) ||
          segment.estimatedTokens <
            0
        ) {
          throw new Error(
            `K.I.N.G.S. Context Budget: invalid token estimate for segment "${segment.id}"`,
          );
        }

        return (
          total +
          segment.estimatedTokens
        );
      },
      0,
    );
  }

  private priorityRank(
    priority: ContextValuePriority,
  ): number {
    switch (
      priority
    ) {
      case "low":
        return 0;
      case "medium":
        return 1;
      case "high":
        return 2;
    }
  }
}
