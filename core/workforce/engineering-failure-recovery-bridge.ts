import type {
  ID,
} from "./types";

import {
  EngineeringFailureRecoveryAuthority,
  type EngineeringFailureRecoveryPolicy,
  type EngineeringFailureAnalysis,
} from "./engineering-failure-recovery";

import {
  EngineeringRepairPlannerAuthority,
  type EngineeringRepairPlan,
} from "./engineering-repair-planner";

import type {
  EngineeringExecutionPipelineResult,
} from "./engineering-execution-pipeline";

export interface EngineeringFailureRecoveryBridgeRequest {
  pipeline:
    EngineeringExecutionPipelineResult;
  attemptNumber:
    number;
  policy:
    EngineeringFailureRecoveryPolicy;
}

export interface EngineeringFailureRecoveryBridgeResult {
  id:
    ID;
  projectId:
    ID;
  analysis:
    EngineeringFailureAnalysis;
  repairPlan:
    EngineeringRepairPlan;
  recoveryRequired:
    boolean;
}

export class EngineeringFailureRecoveryBridge {
  private readonly recovery:
    EngineeringFailureRecoveryAuthority;

  private readonly planner:
    EngineeringRepairPlannerAuthority;

  constructor() {
    this.recovery =
      new EngineeringFailureRecoveryAuthority();

    this.planner =
      new EngineeringRepairPlannerAuthority();
  }

  resolve(
    request:
      EngineeringFailureRecoveryBridgeRequest,
  ):
    EngineeringFailureRecoveryBridgeResult {
    const attempt =
      request.pipeline.execution.attempts[
        request.pipeline.execution.attempts.length - 1
      ];

    if (!attempt?.result) {
      throw new Error(
        "K.I.N.G.S. Failure Recovery Bridge: pipeline produced no engineering result",
      );
    }

    const analysis =
      this.recovery.analyze(
        attempt.result,
        request.attemptNumber,
        request.policy,
      );

    const repairPlan =
      this.planner.plan(
        analysis,
      );

    return {
      id:
        `failure-recovery-${attempt.result.id}`,
      projectId:
        attempt.result.projectId,
      analysis,
      repairPlan,
      recoveryRequired:
        analysis.action !==
        "complete",
    };
  }
}
