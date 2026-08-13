import type {
  GovernedMemoryRecord,
} from "./memory-health-002-enforcement";

import type {
  MemoryContextCandidate,
  ContextBudgetPolicy,
} from "./memory-health-003-context-budget";

export interface MemoryExplainabilityMetadata {
  readonly provenance:
    string[];

  readonly verificationEvidence:
    string[];
}

export interface ExplainableMemoryContextCandidate
  extends MemoryContextCandidate {
  readonly metadata?:
    MemoryExplainabilityMetadata;
}

export interface MemoryAdmissionDecision {
  readonly memoryId:
    string;

  readonly admitted:
    boolean;

  readonly rank:
    number;

  readonly score:
    number;

  readonly relevance:
    number;

  readonly priority:
    number;

  readonly authority:
    string;

  readonly lifecycleClass:
    string;

  readonly retention:
    string;

  readonly active:
    boolean;

  readonly durable:
    boolean;

  readonly requiresVerification:
    boolean;

  readonly estimatedTokens:
    number;

  readonly budgetBefore:
    number;

  readonly budgetAfter:
    number;

  readonly reason:
    string;

  readonly provenance:
    string[];

  readonly verificationEvidence:
    string[];

  readonly outrankedMemoryIds:
    string[];
}

export interface ExplainableContextSelection {
  readonly records:
    GovernedMemoryRecord[];

  readonly decisions:
    MemoryAdmissionDecision[];

  readonly estimatedTokens:
    number;

  readonly budget:
    number;

  readonly admittedCount:
    number;

  readonly rejectedCount:
    number;
}

export class MemoryRetrievalExplainabilityAuthority {
  explain(
    candidates:
      ExplainableMemoryContextCandidate[],

    policy:
      ContextBudgetPolicy,
  ):
    ExplainableContextSelection {
    if (
      policy.maxTokens <=
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Retrieval Explainability: context budget must be positive.",
      );
    }

    if (
      policy.minimumRelevance <
        0 ||
      policy.minimumRelevance >
        1
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Retrieval Explainability: minimum relevance must be between 0 and 1.",
      );
    }

    const eligible =
      candidates
        .filter(
          (
            candidate,
          ) =>
            candidate.relevance >=
              policy.minimumRelevance &&
            candidate.estimatedTokens >
              0 &&
            candidate.record.lifecycle.active,
        )
        .sort(
          (
            left,
            right,
          ) => {
            const leftScore =
              this.score(
                left,
              );

            const rightScore =
              this.score(
                right,
              );

            if (
              rightScore !==
              leftScore
            ) {
              return (
                rightScore -
                leftScore
              );
            }

            return (
              right.relevance -
              left.relevance
            );
          },
        );

    const decisions:
      MemoryAdmissionDecision[] =
      [];

    const selected:
      GovernedMemoryRecord[] =
      [];

    let remaining =
      policy.maxTokens;

    for (
      let index = 0;
      index <
        eligible.length;
      index += 1
    ) {
      const candidate =
        eligible[index];

      const score =
        this.score(
          candidate,
        );

      const budgetBefore =
        remaining;

      const outranked =
        eligible
          .slice(
            index + 1,
          )
          .filter(
            (
              lower,
            ) =>
              this.score(
                lower,
              ) <
              score,
          )
          .map(
            (
              lower,
            ) =>
              lower.record.id,
          );

      if (
        candidate.estimatedTokens >
        remaining
      ) {
        decisions.push(
          this.decision(
            candidate,
            false,
            index + 1,
            score,
            budgetBefore,
            remaining,
            "Rejected because admitting this memory would exceed the remaining context budget.",
            outranked,
          ),
        );

        continue;
      }

      selected.push(
        candidate.record,
      );

      remaining -=
        candidate.estimatedTokens;

      decisions.push(
        this.decision(
          candidate,
          true,
          index + 1,
          score,
          budgetBefore,
          remaining,
          "Admitted because the memory is active, meets the relevance threshold, and fits within the remaining context budget.",
          outranked,
        ),
      );
    }

    for (
      const candidate of
        candidates
    ) {
      if (
        decisions.some(
          (
            decision,
          ) =>
            decision.memoryId ===
            candidate.record.id,
        )
      ) {
        continue;
      }

      let reason =
        "Rejected by retrieval governance.";

      if (
        !candidate.record
          .lifecycle.active
      ) {
        reason =
          "Rejected because the memory is not active.";
      } else if (
        candidate.relevance <
        policy.minimumRelevance
      ) {
        reason =
          "Rejected because relevance is below the configured admission threshold.";
      }

      decisions.push(
        this.decision(
          candidate,
          false,
          0,
          this.score(
            candidate,
          ),
          remaining,
          remaining,
          reason,
          [],
        ),
      );
    }

    return {
      records:
        selected,

      decisions,

      estimatedTokens:
        policy.maxTokens -
        remaining,

      budget:
        policy.maxTokens,

      admittedCount:
        selected.length,

      rejectedCount:
        decisions.filter(
          (
            decision,
          ) =>
            !decision.admitted,
        ).length,
    };
  }

  private decision(
    candidate:
      ExplainableMemoryContextCandidate,

    admitted:
      boolean,

    rank:
      number,

    score:
      number,

    budgetBefore:
      number,

    budgetAfter:
      number,

    reason:
      string,

    outrankedMemoryIds:
      string[],
  ):
    MemoryAdmissionDecision {
    const lifecycle =
      candidate.record.lifecycle;

    return {
      memoryId:
        candidate.record.id,

      admitted,

      rank,

      score,

      relevance:
        candidate.relevance,

      priority:
        candidate.priority,

      authority:
        lifecycle.authority,

      lifecycleClass:
        lifecycle.lifecycleClass,

      retention:
        lifecycle.retention,

      active:
        lifecycle.active,

      durable:
        lifecycle.durable,

      requiresVerification:
        lifecycle.requiresVerification,

      estimatedTokens:
        candidate.estimatedTokens,

      budgetBefore,

      budgetAfter,

      reason,

      provenance:
        [
          ...(candidate.metadata
            ?.provenance ??
            []),
        ],

      verificationEvidence:
        [
          ...(candidate.metadata
            ?.verificationEvidence ??
            []),
        ],

      outrankedMemoryIds:
        outrankedMemoryIds,
    };
  }

  private score(
    candidate:
      MemoryContextCandidate,
  ):
    number {
    const authorityWeight =
      candidate.record.lifecycle
        .authority ===
      "authoritative"
        ? 1
        : candidate.record.lifecycle
              .authority ===
            "verified"
          ? 0.75
          : 0.5;

    const lifecycleWeight =
      candidate.record.lifecycle
        .lifecycleClass ===
      "mission"
        ? 1
        : candidate.record.lifecycle
              .lifecycleClass ===
            "project"
          ? 0.95
          : candidate.record.lifecycle
                .lifecycleClass ===
              "authoritative"
            ? 0.9
            : candidate.record.lifecycle
                  .lifecycleClass ===
                "procedural"
              ? 0.8
              : 0.6;

    return (
      candidate.relevance *
        0.55 +
      candidate.priority *
        0.25 +
      authorityWeight *
        0.1 +
      lifecycleWeight *
        0.1
    );
  }
}
