import type {
  EngineeringFailureRecoveryPolicy,
} from "./engineering-failure-recovery";

import {
  LocalCodingWriteBridge,
  type AuthorizedLocalCodingWriteProposal,
  type LocalCodingWriteRequest,
  type LocalCodingWriteResult,
} from "./local-coding-write-bridge";

import {
  LocalEngineeringExecutionRunner,
  type ExecuteLocalEngineeringRequest,
  type LocalEngineeringExecutionReport,
} from "./local-engineering-execution-runner";

import {
  LocalEngineeringRecoveryBridge,
  type LocalEngineeringRecoveryResult,
} from "./local-engineering-recovery-bridge";

import type {
  LocalProjectEngineeringReadinessResult,
} from "./local-project-engineering-readiness";

export interface LocalEngineeringRecoveryExecutionPort {
  execute(
    request: ExecuteLocalEngineeringRequest,
  ): LocalEngineeringExecutionReport;
}

export interface LocalEngineeringRecoveryWritePort {
  execute(
    request: LocalCodingWriteRequest,
  ): Promise<LocalCodingWriteResult>;
}

export interface LocalEngineeringRecoveryCycleRequest {
  readiness: LocalProjectEngineeringReadinessResult;
  report: LocalEngineeringExecutionReport;
  attemptNumber: number;
  policy: EngineeringFailureRecoveryPolicy;
  authorized: boolean;
  workspaceRoot: string;
  proposal?: AuthorizedLocalCodingWriteProposal;
  timeoutMs?: number;
  completedAt?: string;
}

export interface LocalEngineeringRecoveryCycleResult {
  status: "completed" | "failed" | "blocked";
  verified: boolean;
  initialRecovery: LocalEngineeringRecoveryResult;
  writeResult?: LocalCodingWriteResult;
  retestReport?: LocalEngineeringExecutionReport;
  finalRecovery?: LocalEngineeringRecoveryResult;
  failureReason?: string;
}

/**
 * Executes one bounded governed recovery cycle for a real local repository.
 *
 * This composes the existing authorities instead of creating another repair
 * policy: LocalEngineeringRecoveryBridge decides retry/repair/blocked/complete,
 * LocalCodingWriteBridge performs an already-authorized repair proposal, and the
 * repository-native LocalEngineeringExecutionRunner supplies the real retest.
 * A failed retest is returned to the mission controller for the next bounded
 * recovery cycle rather than being hidden behind an unbounded autonomous loop.
 */
export class LocalEngineeringRecoveryCycle {
  constructor(
    private readonly writer: LocalEngineeringRecoveryWritePort,
    private readonly runner: LocalEngineeringRecoveryExecutionPort =
      new LocalEngineeringExecutionRunner(),
    private readonly recovery: LocalEngineeringRecoveryBridge =
      new LocalEngineeringRecoveryBridge(),
  ) {}

  async execute(
    request: LocalEngineeringRecoveryCycleRequest,
  ): Promise<LocalEngineeringRecoveryCycleResult> {
    if (!request.workspaceRoot.trim()) {
      throw new Error(
        "K.I.N.G.S. Local Engineering Recovery Cycle: workspace root is required.",
      );
    }

    const initialRecovery = this.recovery.analyze({
      report: request.report,
      attemptNumber: request.attemptNumber,
      policy: request.policy,
      ...(request.completedAt ? { completedAt: request.completedAt } : {}),
    });

    if (initialRecovery.analysis.action === "complete") {
      return {
        status: "completed",
        verified: true,
        initialRecovery,
      };
    }

    if (
      initialRecovery.analysis.action === "blocked" ||
      initialRecovery.analysis.action === "escalate"
    ) {
      return {
        status: "blocked",
        verified: false,
        initialRecovery,
        failureReason: initialRecovery.analysis.reason,
      };
    }

    let writeResult: LocalCodingWriteResult | undefined;

    if (initialRecovery.analysis.action === "repair") {
      const editStep = initialRecovery.repairPlan.steps.find(
        (step) => step.strategy === "edit",
      );

      if (!editStep) {
        return {
          status: "blocked",
          verified: false,
          initialRecovery,
          failureReason:
            "Authorized repair analysis produced no governed edit step.",
        };
      }

      if (!request.proposal) {
        return {
          status: "blocked",
          verified: false,
          initialRecovery,
          failureReason:
            "A governed repair proposal is required before K.I.N.G.S. may edit repository files.",
        };
      }

      try {
        writeResult = await this.writer.execute({
          step: editStep,
          projectId: initialRecovery.repairPlan.projectId,
          workspaceRoot: request.workspaceRoot,
          proposal: request.proposal,
        });
      } catch (error) {
        return {
          status: "failed",
          verified: false,
          initialRecovery,
          failureReason:
            error instanceof Error ? error.message : String(error),
        };
      }
    }

    const retestReport = this.runner.execute({
      readiness: request.readiness,
      authorized: request.authorized,
      ...(request.timeoutMs === undefined
        ? {}
        : { timeoutMs: request.timeoutMs }),
    });

    const finalRecovery = this.recovery.analyze({
      report: retestReport,
      attemptNumber: request.attemptNumber + 1,
      policy: request.policy,
    });

    if (finalRecovery.analysis.action === "complete") {
      return {
        status: "completed",
        verified: true,
        initialRecovery,
        ...(writeResult ? { writeResult } : {}),
        retestReport,
        finalRecovery,
      };
    }

    if (finalRecovery.analysis.action === "blocked") {
      return {
        status: "blocked",
        verified: false,
        initialRecovery,
        ...(writeResult ? { writeResult } : {}),
        retestReport,
        finalRecovery,
        failureReason: finalRecovery.analysis.reason,
      };
    }

    return {
      status: "failed",
      verified: false,
      initialRecovery,
      ...(writeResult ? { writeResult } : {}),
      retestReport,
      finalRecovery,
      failureReason: finalRecovery.analysis.reason,
    };
  }
}

export function createLocalEngineeringRecoveryCycle(
  writer: LocalCodingWriteBridge,
): LocalEngineeringRecoveryCycle {
  return new LocalEngineeringRecoveryCycle(writer);
}
