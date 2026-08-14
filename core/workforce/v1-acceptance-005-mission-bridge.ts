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
} from "./durable-workflow-resume";

import {
  MissionContinuityStore,
  type MissionCheckpoint,
  type MissionState,
} from "./mission-continuity";

export interface V1AcceptanceMissionBridgeRequest {
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

  missionId:
    ID;

  planId:
    ID;

  planVersion:
    number;

  checkpointId:
    ID;

  checkpointSummary:
    string;

  checkpointReason:
    string;

  checkpointCreatedAt:
    string;
}

export interface V1AcceptanceMissionBridgeResult {
  accepted:
    boolean;

  durableTaskRecorded:
    boolean;

  missionStateRecorded:
    boolean;

  checkpointRecorded:
    boolean;

  evidenceIds:
    ID[];

  verificationIds:
    ID[];

  reasons:
    string[];

  missionState:
    MissionState;

  checkpoint:
    MissionCheckpoint;
}

export class V1AcceptanceMissionBridge {
  private readonly durableBridge:
    V1AcceptanceDurableBridge;

  constructor(
    durableWorkflow:
      DurableWorkflowResumeAuthority,
    private readonly missionContinuity:
      MissionContinuityStore,
  ) {
    this.durableBridge =
      new V1AcceptanceDurableBridge(
        durableWorkflow,
      );
  }

  recordAcceptedTask(
    request:
      V1AcceptanceMissionBridgeRequest,
  ):
    V1AcceptanceMissionBridgeResult {
    const existingState =
      this.requireState(
        request.missionId,
      );

    const durable =
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
      !durable.accepted
    ) {
      return {
        accepted:
          false,

        durableTaskRecorded:
          false,

        missionStateRecorded:
          false,

        checkpointRecorded:
          false,

        evidenceIds:
          durable.evidenceIds,

        verificationIds:
          durable.verificationIds,

        reasons:
          durable.reasons,

        missionState:
          existingState,

        checkpoint:
          this.emptyCheckpoint(
            request,
          ),
      };
    }

    this.missionContinuity.updateState(
      request.missionId,
      {
        activeTaskIds:
          existingState.activeTaskIds.filter(
            (taskId) =>
              taskId !==
              request.taskId,
          ),

        completedTaskIds: [
          ...new Set([
            ...existingState.completedTaskIds,
            request.taskId,
          ]),
        ],

        blockedTaskIds: [
          ...existingState.blockedTaskIds.filter(
            (taskId) =>
              taskId !==
              request.taskId,
          ),
        ],

        evidenceIds: [
          ...new Set([
            ...existingState.evidenceIds,
            ...durable.evidenceIds,
          ]),
        ],

        artifactIds: [
          ...new Set([
            ...existingState.artifactIds,
            ...request.artifactIds,
          ]),
        ],

        updatedAt:
          request.updatedAt,
      },
    );

    const missionState =
      this.requireState(
        request.missionId,
      );

    const checkpoint =
      this.missionContinuity.createCheckpoint({
        id:
          request.checkpointId,

        missionId:
          request.missionId,

        planId:
          request.planId,

        planVersion:
          request.planVersion,

        state:
          missionState,

        summary:
          request.checkpointSummary,

        reason:
          request.checkpointReason,

        createdAt:
          request.checkpointCreatedAt,
      });

    return {
      accepted:
        true,

      durableTaskRecorded:
        true,

      missionStateRecorded:
        true,

      checkpointRecorded:
        true,

      evidenceIds:
        [
          ...durable.evidenceIds,
        ],

      verificationIds:
        [
          ...durable.verificationIds,
        ],

      reasons: [],

      missionState,

      checkpoint,
    };
  }

  private requireState(
    missionId:
      ID,
  ):
    MissionState {
    const state =
      this.missionContinuity.getState(
        missionId,
      );

    if (!state) {
      throw new Error(
        `K.I.N.G.S. V1 Acceptance Mission Bridge: mission "${missionId}" has no state`,
      );
    }

    return state;
  }

  private emptyCheckpoint(
    request:
      V1AcceptanceMissionBridgeRequest,
  ):
    MissionCheckpoint {
    return {
      id:
        request.checkpointId,

      missionId:
        request.missionId,

      planId:
        request.planId,

      planVersion:
        request.planVersion,

      state:
        this.requireState(
          request.missionId,
        ),

      summary:
        request.checkpointSummary,

      reason:
        request.checkpointReason,

      createdAt:
        request.checkpointCreatedAt,
    };
  }
}
