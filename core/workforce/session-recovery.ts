import type {
  ID,
} from "./types";

import {
  ExecutionContinuityAuthority,
  type ExecutionContinuityRecord,
} from "./execution-continuity";

import {
  RuntimeSessionRegistry,
  type RuntimeSession,
} from "./runtime-session";

export type SessionRecoveryStatus =
  | "recoverable"
  | "recovered"
  | "blocked";

export interface SessionRecoveryRecord {
  id: ID;
  executionId: ID;
  lostRuntimeSessionId: ID;
  detectedAt: string;
  status: SessionRecoveryStatus;
  reason: string;
  recoveredRuntimeSessionId?: ID;
  recoveredAt?: string;
}

export interface SessionRecoveryResult {
  recovery:
    SessionRecoveryRecord;
  execution:
    ExecutionContinuityRecord;
  runtime:
    RuntimeSession;
}

export class SessionRecoveryAuthority {
  private readonly recoveries =
    new Map<ID, SessionRecoveryRecord>();

  constructor(
    private readonly continuity:
      ExecutionContinuityAuthority,
    private readonly runtimeSessions:
      RuntimeSessionRegistry,
  ) {}

  detectRuntimeLoss(
    recoveryId:
      ID,
    executionId:
      ID,
    detectedAt:
      string,
  ):
    SessionRecoveryRecord {
    if (!recoveryId.trim()) {
      throw new Error(
        "K.I.N.G.S. Session Recovery: recovery id is required",
      );
    }

    if (
      this.recoveries.has(
        recoveryId,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: recovery "${recoveryId}" already exists`,
      );
    }

    const execution =
      this.continuity.get(
        executionId,
      );

    if (!execution) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: execution "${executionId}" was not found`,
      );
    }

    const runtime =
      this.runtimeSessions.get(
        execution.runtimeSessionId,
      );

    if (!runtime) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: runtime session "${execution.runtimeSessionId}" was not found`,
      );
    }

    if (runtime.active) {
      throw new Error(
        "K.I.N.G.S. Session Recovery: runtime has not been lost",
      );
    }

    const recovery:
      SessionRecoveryRecord = {
        id:
          recoveryId,
        executionId:
          execution.id,
        lostRuntimeSessionId:
          runtime.id,
        detectedAt,
        status:
          "recoverable",
        reason:
          "Runtime session became inactive while execution continuity remained unresolved.",
      };

    this.recoveries.set(
      recovery.id,
      recovery,
    );

    return this.clone(
      recovery,
    );
  }

  recover(
    recoveryId:
      ID,
    replacementRuntimeSessionId:
      ID,
    recoveredAt:
      string,
  ):
    SessionRecoveryResult {
    const recovery =
      this.require(
        recoveryId,
      );

    if (
      recovery.status !==
      "recoverable"
    ) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: recovery "${recoveryId}" is not recoverable`,
      );
    }

    const replacement =
      this.runtimeSessions.get(
        replacementRuntimeSessionId,
      );

    if (!replacement) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: replacement runtime session "${replacementRuntimeSessionId}" was not found`,
      );
    }

    if (!replacement.active) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: replacement runtime session "${replacementRuntimeSessionId}" is inactive`,
      );
    }

    const execution =
      this.continuity.get(
        recovery.executionId,
      );

    if (!execution) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: execution "${recovery.executionId}" was not found`,
      );
    }

    if (
      execution.runtimeSessionId !==
      recovery.lostRuntimeSessionId
    ) {
      throw new Error(
        "K.I.N.G.S. Session Recovery: execution runtime no longer matches recorded lost runtime",
      );
    }

    if (
      execution.status !==
      "active"
    ) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: execution "${execution.id}" is not recoverable from "${execution.status}"`,
      );
    }

    const lostRuntime =
      this.runtimeSessions.get(
        recovery.lostRuntimeSessionId,
      );

    if (!lostRuntime) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: lost runtime session "${recovery.lostRuntimeSessionId}" was not found`,
      );
    }

    if (
      replacement.ownerId !==
      lostRuntime.ownerId
    ) {
      throw new Error(
        "K.I.N.G.S. Session Recovery: replacement runtime is not owned by the same owner",
      );
    }

    /*
     * Runtime loss is converted into the normal continuity
     * pause/resume transition. The pause records the execution
     * checkpoint boundary; resume then performs the governed
     * replacement-runtime transition.
     */
    this.continuity.pause(
      execution.id,
      recoveredAt,
    );

    const resumed =
      this.continuity.resume(
        execution.id,
        replacementRuntimeSessionId,
        recoveredAt,
      );

    recovery.status =
      "recovered";
    recovery.recoveredRuntimeSessionId =
      replacementRuntimeSessionId;
    recovery.recoveredAt =
      recoveredAt;

    this.recoveries.set(
      recovery.id,
      recovery,
    );

    return {
      recovery:
        this.clone(
          recovery,
        ),
      execution:
        resumed.execution,
      runtime:
        resumed.runtime,
    };
  }

  block(
    recoveryId:
      ID,
    reason:
      string,
  ):
    SessionRecoveryRecord {
    const recovery =
      this.require(
        recoveryId,
      );

    if (
      recovery.status !==
      "recoverable"
    ) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: recovery "${recoveryId}" cannot be blocked from "${recovery.status}"`,
      );
    }

    if (!reason.trim()) {
      throw new Error(
        "K.I.N.G.S. Session Recovery: block reason is required",
      );
    }

    recovery.status =
      "blocked";
    recovery.reason =
      reason.trim();

    this.recoveries.set(
      recovery.id,
      recovery,
    );

    return this.clone(
      recovery,
    );
  }

  get(
    recoveryId:
      ID,
  ):
    SessionRecoveryRecord |
    undefined {
    const recovery =
      this.recoveries.get(
        recoveryId,
      );

    return recovery
      ? this.clone(
          recovery,
        )
      : undefined;
  }

  listForExecution(
    executionId:
      ID,
  ):
    SessionRecoveryRecord[] {
    return [
      ...this.recoveries.values(),
    ]
      .filter(
        (recovery) =>
          recovery.executionId ===
          executionId,
      )
      .map(
        (recovery) =>
          this.clone(
            recovery,
          ),
      );
  }

  private require(
    recoveryId:
      ID,
  ):
    SessionRecoveryRecord {
    const recovery =
      this.recoveries.get(
        recoveryId,
      );

    if (!recovery) {
      throw new Error(
        `K.I.N.G.S. Session Recovery: recovery "${recoveryId}" was not found`,
      );
    }

    return recovery;
  }

  private clone(
    recovery:
      SessionRecoveryRecord,
  ):
    SessionRecoveryRecord {
    return {
      ...recovery,
    };
  }
}
