import type {
  ID,
} from "./types";

export type WorkerFailureKind =
  | "transient-execution"
  | "execution-rejected"
  | "verification-failed"
  | "budget-exhausted"
  | "invalid-work-unit"
  | "authorization-failed"
  | "dependency-blocked"
  | "unknown";

export type RecoveryAction =
  | "retry"
  | "repair"
  | "escalate"
  | "preserve";

export type RecoveryStrategy =
  | "retry-same-contract"
  | "retry-with-fresh-execution"
  | "repair-work-unit"
  | "escalate-to-review"
  | "preserve-for-human-decision";

export interface WorkerFailureRecord {
  id:
    ID;

  taskId:
    ID;

  workUnitId:
    ID;

  kind:
    WorkerFailureKind;

  summary:
    string;

  details:
    string[];

  attempt:
    number;

  evidenceIds:
    ID[];

  priorFailureIds:
    ID[];

  createdAt:
    string;
}

export interface RecoveryAttempt {
  attempt:
    number;

  failureId:
    ID;

  strategy:
    RecoveryStrategy;

  action:
    RecoveryAction;

  meaningfulChange:
    boolean;

  reason:
    string;

  createdAt:
    string;
}

export interface RecoveryPolicy {
  maxRecoveryAttempts:
    number;

  retryableKinds:
    WorkerFailureKind[];

  repairableKinds:
    WorkerFailureKind[];

  neverRetryKinds:
    WorkerFailureKind[];
}

export interface RepairWorkUnit {
  id:
    ID;

  parentTaskId:
    ID;

  parentWorkUnitId:
    ID;

  recoveryAttempt:
    number;

  objective:
    string;

  changedStrategy:
    string;

  inheritedEvidenceIds:
    ID[];

  preservedFailureIds:
    ID[];

  acceptanceCriteria:
    string[];

  createdAt:
    string;
}

export interface RecoveryDecision {
  action:
    RecoveryAction;

  strategy:
    RecoveryStrategy;

  allowed:
    boolean;

  reason:
    string;

  failureId:
    ID;

  recoveryAttempt:
    number;

  repairWorkUnit?:
    RepairWorkUnit;

  escalationRequired:
    boolean;
}

export interface FailureEscalationResult {
  failure:
    WorkerFailureRecord;

  decision:
    RecoveryDecision;

  history:
    RecoveryAttempt[];
}

const DEFAULT_POLICY:
  RecoveryPolicy = {
  maxRecoveryAttempts:
    2,

  retryableKinds: [
    "transient-execution",
  ],

  repairableKinds: [
    "verification-failed",
    "unknown",
  ],

  neverRetryKinds: [
    "execution-rejected",
    "budget-exhausted",
    "invalid-work-unit",
    "authorization-failed",
    "dependency-blocked",
  ],
};

export class FailureEscalationAuthority {
  private readonly policy:
    RecoveryPolicy;

  constructor(
    policy:
      RecoveryPolicy =
      DEFAULT_POLICY,
  ) {
    this.validatePolicy(
      policy,
    );

    this.policy =
      {
        maxRecoveryAttempts:
          policy.maxRecoveryAttempts,

        retryableKinds:
          [
            ...policy.retryableKinds,
          ],

        repairableKinds:
          [
            ...policy.repairableKinds,
          ],

        neverRetryKinds:
          [
            ...policy.neverRetryKinds,
          ],
      };
  }

  classify(
    input: {
      executionStatus?:
        | "success"
        | "partial"
        | "failure"
        | "rejected";

      verificationPassed?:
        boolean;

      budgetExhausted?:
        boolean;

      workUnitValid?:
        boolean;

      authorized?:
        boolean;

      dependencyBlocked?:
        boolean;

      summary:
        string;
    },
  ): WorkerFailureKind {
    if (
      input.budgetExhausted ===
      true
    ) {
      return "budget-exhausted";
    }

    if (
      input.workUnitValid ===
      false
    ) {
      return "invalid-work-unit";
    }

    if (
      input.authorized ===
      false
    ) {
      return "authorization-failed";
    }

    if (
      input.dependencyBlocked ===
      true
    ) {
      return "dependency-blocked";
    }

    if (
      input.executionStatus ===
      "rejected"
    ) {
      return "execution-rejected";
    }

    if (
      input.verificationPassed ===
      false
    ) {
      return "verification-failed";
    }

    if (
      input.executionStatus ===
      "failure"
    ) {
      return "transient-execution";
    }

    return "unknown";
  }

  recordFailure(
    input: {
      taskId:
        ID;

      workUnitId:
        ID;

      kind:
        WorkerFailureKind;

      summary:
        string;

      details?:
        string[];

      attempt:
        number;

      evidenceIds?:
        ID[];

      priorFailureIds?:
        ID[];
    },
  ): WorkerFailureRecord {
    return {
      id:
        `failure-${input.taskId}-${input.attempt}-${Date.now()}`,

      taskId:
        input.taskId,

      workUnitId:
        input.workUnitId,

      kind:
        input.kind,

      summary:
        input.summary,

      details:
        [
          ...(input.details ??
            []),
        ],

      attempt:
        input.attempt,

      evidenceIds:
        [
          ...(input.evidenceIds ??
            []),
        ],

      priorFailureIds:
        [
          ...(input.priorFailureIds ??
            []),
        ],

      createdAt:
        new Date().toISOString(),
    };
  }

  decide(
    failure:
      WorkerFailureRecord,
    history:
      RecoveryAttempt[] = [],
  ): RecoveryDecision {
    const recoveryAttempt =
      history.length + 1;

    if (
      this.policy.neverRetryKinds.includes(
        failure.kind,
      )
    ) {
      return {
        action:
          "escalate",

        strategy:
          "escalate-to-review",

        allowed:
          false,

        reason:
          `Failure kind "${failure.kind}" is not eligible for automatic recovery.`,

        failureId:
          failure.id,

        recoveryAttempt,

        escalationRequired:
          true,
      };
    }

    if (
      recoveryAttempt >
      this.policy.maxRecoveryAttempts
    ) {
      return {
        action:
          "escalate",

        strategy:
          "escalate-to-review",

        allowed:
          false,

        reason:
          "Maximum authorized recovery attempts have been exhausted.",

        failureId:
          failure.id,

        recoveryAttempt,

        escalationRequired:
          true,
      };
    }

    if (
      this.policy.repairableKinds.includes(
        failure.kind,
      )
    ) {
      const repairWorkUnit =
        this.createRepairWorkUnit(
          failure,
          recoveryAttempt,
        );

      return {
        action:
          "repair",

        strategy:
          "repair-work-unit",

        allowed:
          true,

        reason:
          "Failure requires a meaningfully different recovery path.",

        failureId:
          failure.id,

        recoveryAttempt,

        repairWorkUnit,

        escalationRequired:
          false,
      };
    }

    if (
      this.policy.retryableKinds.includes(
        failure.kind,
      )
    ) {
      const strategy:
        RecoveryStrategy =
        history.length ===
        0
          ? "retry-same-contract"
          : "retry-with-fresh-execution";

      const meaningfulChange =
        history.length >
        0;

      if (
        history.length > 0 &&
        !meaningfulChange
      ) {
        return {
          action:
            "escalate",

          strategy:
            "escalate-to-review",

          allowed:
            false,

          reason:
            "A repeated recovery attempt must use a meaningfully different strategy.",

          failureId:
            failure.id,

          recoveryAttempt,

          escalationRequired:
            true,
        };
      }

      return {
        action:
          "retry",

        strategy,

        allowed:
          true,

        reason:
          meaningfulChange
            ? "Retry is authorized with a fresh execution attempt."
            : "Initial transient failure is eligible for one bounded retry.",

        failureId:
          failure.id,

        recoveryAttempt,

        escalationRequired:
          false,
      };
    }

    return {
      action:
        "escalate",

      strategy:
        "escalate-to-review",

      allowed:
        false,

      reason:
        "Failure could not be matched to an authorized recovery policy.",

      failureId:
        failure.id,

      recoveryAttempt,

      escalationRequired:
        true,
    };
  }

  createAttempt(
    failure:
      WorkerFailureRecord,
    decision:
      RecoveryDecision,
  ): RecoveryAttempt {
    return {
      attempt:
        decision.recoveryAttempt,

      failureId:
        failure.id,

      strategy:
        decision.strategy,

      action:
        decision.action,

      meaningfulChange:
        decision.strategy ===
        "repair-work-unit" ||
        decision.strategy ===
        "retry-with-fresh-execution",

      reason:
        decision.reason,

      createdAt:
        new Date().toISOString(),
    };
  }

  evaluate(
    input: {
      taskId:
        ID;

      workUnitId:
        ID;

      kind:
        WorkerFailureKind;

      summary:
        string;

      details?:
        string[];

      attempt:
        number;

      evidenceIds?:
        ID[];

      priorFailureIds?:
        ID[];

      history?:
        RecoveryAttempt[];
    },
  ): FailureEscalationResult {
    const failure =
      this.recordFailure(
        {
          taskId:
            input.taskId,

          workUnitId:
            input.workUnitId,

          kind:
            input.kind,

          summary:
            input.summary,

          details:
            input.details,

          attempt:
            input.attempt,

          evidenceIds:
            input.evidenceIds,

          priorFailureIds:
            input.priorFailureIds,
        },
      );

    const decision =
      this.decide(
        failure,
        input.history ??
          [],
      );

    const nextHistory =
      [
        ...(input.history ??
          []),
        this.createAttempt(
          failure,
          decision,
        ),
      ];

    return {
      failure,
      decision,
      history:
        nextHistory,
    };
  }

  private createRepairWorkUnit(
    failure:
      WorkerFailureRecord,
    recoveryAttempt:
      number,
  ): RepairWorkUnit {
    return {
      id:
        `repair-${failure.taskId}-${recoveryAttempt}-${Date.now()}`,

      parentTaskId:
        failure.taskId,

      parentWorkUnitId:
        failure.workUnitId,

      recoveryAttempt,

      objective:
        `Repair the failed work represented by task "${failure.taskId}".`,

      changedStrategy:
        "Use the preserved failure evidence to correct the failed approach rather than repeating the same execution.",

      inheritedEvidenceIds:
        [
          ...failure.evidenceIds,
        ],

      preservedFailureIds:
        [
          failure.id,
          ...failure.priorFailureIds,
        ],

      acceptanceCriteria: [
        "The failure cause is addressed.",
        "The recovery approach differs materially from the failed attempt.",
        "Original failure evidence remains preserved.",
        "Completion requires normal K.I.N.G.S. verification.",
      ],

      createdAt:
        new Date().toISOString(),
    };
  }

  private validatePolicy(
    policy:
      RecoveryPolicy,
  ): void {
    if (
      !Number.isInteger(
        policy.maxRecoveryAttempts,
      ) ||
      policy.maxRecoveryAttempts <=
        0
    ) {
      throw new Error(
        "FailureEscalationAuthority: maxRecoveryAttempts must be a positive integer.",
      );
    }
  }
}
