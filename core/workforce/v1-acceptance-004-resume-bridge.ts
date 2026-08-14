import type {
  ID,
} from "./types";

import {
  V1AcceptanceDecision,
} from "./v1-acceptance-001";

import {
  V1AcceptanceDurableBridge,
} from "./v1-acceptance-003-durable-bridge";

import {
  DurableWorkflowResumeAuthority,
  type DurableWorkflowResumeResult,
} from "./durable-workflow-resume";

import type {
  ExecutionContinuityRecord,
} from "./execution-continuity";

import type {
  SessionRecoveryRecord,
} from "./session-recovery";

export interface V1AcceptanceResumeBridgeRequest {
  workflowId:
    ID;

  taskId:
    ID;

  acceptance:
    V1AcceptanceDecision;

  artifactIds:
    ID[];

  completedAt:
    string;

  updatedAt:
    string;

  execution:
    ExecutionContinuityRecord;

  recovery:
    SessionRecoveryRecord;
}

export interface V1AcceptanceResumeBridgeResult {
  accepted:
    boolean;

  durableTaskRecorded:
    boolean;

  resumed:
    boolean;

  resumedTaskId?:
    ID;

  evidenceIds:
    ID[];

  verificationIds:
    ID[];

  reasons:
    string[];

  workflow:
    DurableWorkflowResumeResult;
}

export class V1AcceptanceResumeBridge {
  private readonly durableBridge:
    V1AcceptanceDurableBridge;

  constructor(
    private readonly durableWorkflow:
      DurableWorkflowResumeAuthority,
  ) {
    this.durableBridge =
      new V1AcceptanceDurableBridge(
        durableWorkflow,
      );
  }

  process(
    request:
      V1AcceptanceResumeBridgeRequest,
  ):
    V1AcceptanceResumeBridgeResult {
    const reasons:
      string[] = [];

    const durableResult =
      this.durableBridge.recordAcceptance({
        workflowId:
          request.workflowId,

        taskId:
          request.taskId,

        acceptance:
          request.acceptance,

        artifactIds:
          request.artifactIds,

        completedAt:
          request.completedAt,

        updatedAt:
          request.updatedAt,
      });

    if (
      !durableResult.accepted
    ) {
      return {
        accepted:
          false,

        durableTaskRecorded:
          false,

        resumed:
          false,

        evidenceIds:
          durableResult.evidenceIds,

        verificationIds:
          durableResult.verificationIds,

        reasons:
          durableResult.reasons,

        workflow: {
          workflow:
            durableResult.workflow,

          execution:
            request.execution,

          recovery:
            request.recovery,

          resumedTaskId:
            undefined,
        },
      };
    }

    const resumed =
      this.durableWorkflow.resume(
        request.workflowId,
        request.execution,
        request.recovery,
        request.updatedAt,
      );

    const activeTaskId =
      resumed.workflow.activeTaskId;

    if (
      !activeTaskId
    ) {
      reasons.push(
        "Resume completed without selecting an active task.",
      );
    }

    return {
      accepted:
        true,

      durableTaskRecorded:
        true,

      resumed:
        resumed.workflow.status ===
          "running" ||
        resumed.workflow.status ===
          "completed",

      resumedTaskId:
        resumed.resumedTaskId,

      evidenceIds:
        [
          ...durableResult.evidenceIds,
        ],

      verificationIds:
        [
          ...durableResult.verificationIds,
        ],

      reasons,

      workflow:
        resumed,
    };
  }
}
