import type {
  GovernedMemoryRecord,
} from "./memory-health-002-enforcement";

export interface MemoryContextCandidate {
  readonly record:
    GovernedMemoryRecord;

  readonly relevance:
    number;

  readonly priority:
    number;

  readonly estimatedTokens:
    number;
}

export interface ContextSelection {
  readonly records:
    GovernedMemoryRecord[];

  readonly estimatedTokens:
    number;

  readonly budget:
    number;

  readonly considered:
    number;

  readonly omitted:
    number;
}

export interface ContextBudgetPolicy {
  readonly maxTokens:
    number;

  readonly minimumRelevance:
    number;
}

export class MemoryContextBudgetAuthority {
  select(
    candidates:
      MemoryContextCandidate[],

    policy:
      ContextBudgetPolicy,
  ):
    ContextSelection {
    if (
      policy.maxTokens <=
        0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Context Budget: maximum token budget must be positive.",
      );
    }

    if (
      policy.minimumRelevance <
        0 ||
      policy.minimumRelevance >
        1
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Context Budget: minimum relevance must be between 0 and 1.",
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

    const selected:
      GovernedMemoryRecord[] = [];

    let estimatedTokens =
      0;

    for (
      const candidate of
        eligible
    ) {
      if (
        estimatedTokens +
          candidate.estimatedTokens >
        policy.maxTokens
      ) {
        continue;
      }

      selected.push(
        candidate.record,
      );

      estimatedTokens +=
        candidate.estimatedTokens;
    }

    return {
      records:
        selected,

      estimatedTokens,

      budget:
        policy.maxTokens,

      considered:
        candidates.length,

      omitted:
        candidates.length -
        selected.length,
    };
  }

  private score(
    candidate:
      MemoryContextCandidate,
  ):
    number {
    const authorityWeight =
      candidate.record.lifecycle.authority ===
        "authoritative"
        ? 1
        : candidate.record.lifecycle.authority ===
            "verified"
          ? 0.75
          : 0.5;

    const lifecycleWeight =
      candidate.record.lifecycle.lifecycleClass ===
        "mission"
        ? 1
        : candidate.record.lifecycle.lifecycleClass ===
            "project"
          ? 0.95
          : candidate.record.lifecycle.lifecycleClass ===
              "authoritative"
            ? 0.9
            : candidate.record.lifecycle.lifecycleClass ===
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
