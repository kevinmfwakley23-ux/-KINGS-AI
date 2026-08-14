import type {
  ID,
} from "./types";

import {
  V1AcceptanceDecision,
} from "./v1-acceptance-001";

import {
  DurableWorkflowResumeAuthority,
  type DurableWorkflowState,
} from "./durable-workflow-resume";

export interface V1AcceptanceDurableBridgeRequest {
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
}

export interface V1AcceptanceDurableBridgeResult {
  accepted:
    boolean;

  workflow:
    DurableWorkflowState;

  taskId:
    ID;

  evidenceIds:
    ID[];

  artifactIds:
    ID[];

  verificationIds:
    ID[];

  reasons:
    string[];
}

export class V1AcceptanceDurableBridge {
  constructor(
    private readonly durableWorkflow:
      DurableWorkflowResumeAuthority,
  ) {}

  recordAcceptance(
    request:
      V1AcceptanceDurableBridgeRequest,
  ):
    V1AcceptanceDurableBridgeResult {
    const reasons:
      string[] = [];

    if (
      !request.acceptance.accepted
    ) {
      reasons.push(
        ...request.acceptance.reasons.map(
          (reason) =>
            `Acceptance rejected: ${reason}`,
        ),
      );
    }

    if (
      request.acceptance.taskId !==
      request.taskId
    ) {
      reasons.push(
        `Acceptance task "${request.acceptance.taskId}" does not match task "${request.taskId}".`,
      );
    }

    if (
      request.acceptance.evidenceIds.length ===
      0
    ) {
      reasons.push(
        "Accepted work must contain at least one evidence ID.",
      );
    }

    if (
      !request.updatedAt.trim()
    ) {
      reasons.push(
        "updatedAt is required.",
      );
    }

    if (
      !request.completedAt.trim()
    ) {
      reasons.push(
        "completedAt is required.",
      );
    }

    const existing =
      this.readWorkflow(
        request.workflowId,
      );

    if (!existing) {
      throw new Error(
        `K.I.N.G.S. V1 Acceptance Durable Bridge: workflow "${request.workflowId}" was not found`,
      );
    }

    if (
      reasons.length > 0
    ) {
      return {
        accepted:
          false,

        workflow:
          existing,

        taskId:
          request.taskId,

        evidenceIds:
          [
            ...request.acceptance
              .evidenceIds,
          ],

        artifactIds:
          [
            ...request.artifactIds,
          ],

        verificationIds:
          [
            ...request.acceptance
              .verificationIds,
          ],

        reasons,
      };
    }

    const workflow =
      this.durableWorkflow.recordTaskCompletion(
        request.workflowId,
        request.taskId,
        request.acceptance
          .evidenceIds,
        request.artifactIds,
        request.completedAt,
        request.updatedAt,
      );

    return {
      accepted:
        true,

      workflow,

      taskId:
        request.taskId,

      evidenceIds:
        [
          ...request.acceptance
            .evidenceIds,
        ],

      artifactIds:
        [
          ...request.artifactIds,
        ],

      verificationIds:
        [
          ...request.acceptance
            .verificationIds,
        ],

      reasons: [],
    };
  }

  private readWorkflow(
    workflowId:
      ID,
  ):
    DurableWorkflowState |
    undefined {
    try {
      const snapshot =
        this.durableWorkflow
          .get(workflowId);

      return snapshot;
    } catch {
      return undefined;
    }
  }
}
