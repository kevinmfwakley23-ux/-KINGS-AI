import type {
  ID,
  MemoryReference,
  MemoryType,
} from "./types";

import {
  V1AcceptanceDecision,
} from "./v1-acceptance-001";

import {
  MissionMemoryBridge,
  type MissionMemoryRegistration,
} from "./mission-memory-bridge";

import type {
  MissionCheckpoint,
} from "./mission-continuity";

export interface V1AcceptanceMemoryBridgeRequest {
  acceptance:
    V1AcceptanceDecision;

  checkpoint:
    MissionCheckpoint;

  type:
    MemoryType;

  authoritative:
    boolean;

  summary:
    string;

  sourceReferences:
    string[];
}

export interface V1AcceptanceMemoryBridgeResult {
  accepted:
    boolean;

  registered:
    boolean;

  authoritative:
    boolean;

  memoryId:
    ID;

  missionId:
    ID;

  evidenceIds:
    ID[];

  verificationIds:
    ID[];

  reasons:
    string[];

  registration:
    MissionMemoryRegistration;
}

export class V1AcceptanceMemoryBridge {
  constructor(
    private readonly missionMemory:
      MissionMemoryBridge,
  ) {}

  rememberAcceptedOutcome(
    request:
      V1AcceptanceMemoryBridgeRequest,
  ):
    V1AcceptanceMemoryBridgeResult {
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
      request.acceptance.taskId === ""
    ) {
      reasons.push(
        "Accepted task id is required.",
      );
    }

    if (
      request.acceptance.evidenceIds.length ===
      0
    ) {
      reasons.push(
        "Accepted outcome requires evidence.",
      );
    }

    if (
      request.checkpoint.missionId ===
      ""
    ) {
      reasons.push(
        "Checkpoint mission id is required.",
      );
    }

    if (
      request.summary.trim() ===
      ""
    ) {
      reasons.push(
        "Accepted outcome summary is required.",
      );
    }

    const sourceReferences =
      [
        ...new Set([
          ...request.sourceReferences,
          ...request.acceptance.evidenceIds,
          ...request.acceptance.verificationIds,
        ]),
      ];

    if (
      sourceReferences.length ===
      0
    ) {
      reasons.push(
        "Accepted outcome requires provenance.",
      );
    }

    const memory: MemoryReference = {
      id:
        `MISSION-MEMORY-ACCEPTANCE-${request.acceptance.id}`,

      type:
        request.type,

      summary:
        request.summary,

      sourceReferences,

      missionId:
        request.checkpoint.missionId,

      authoritative:
        request.authoritative,

      createdAt:
        request.checkpoint.createdAt,

      updatedAt:
        request.checkpoint.createdAt,
    };

    if (
      reasons.length > 0
    ) {
      return {
        accepted:
          false,

        registered:
          false,

        authoritative:
          false,

        memoryId:
          memory.id,

        missionId:
          request.checkpoint.missionId,

        evidenceIds:
          [
            ...request.acceptance.evidenceIds,
          ],

        verificationIds:
          [
            ...request.acceptance.verificationIds,
          ],

        reasons,

        registration:
          {
            memoryId:
              memory.id,

            missionId:
              request.checkpoint.missionId,

            type:
              request.type,

            summary:
              request.summary,

            sourceReferences,

            authoritative:
              false,
          },
      };
    }

    /*
     * The existing MissionMemoryBridge remains the memory
     * registration/promotion authority.
     *
     * Ordinary accepted outcomes are recorded as mission
     * memory without automatic authoritative promotion.
     *
     * Explicit authoritative acceptance is represented by
     * registering a governed MissionDecision-shaped memory
     * through the existing bridge.
     */
    const registration =
      request.authoritative
        ? this.rememberAuthoritative(
            memory,
            request,
          )
        : this.rememberOrdinary(
            request,
          );

    return {
      accepted:
        true,

      registered:
        true,

      authoritative:
        registration.authoritative,

      memoryId:
        registration.memoryId,

      missionId:
        registration.missionId,

      evidenceIds:
        [
          ...request.acceptance.evidenceIds,
        ],

      verificationIds:
        [
          ...request.acceptance.verificationIds,
        ],

      reasons: [],

      registration,
    };
  }

  private rememberOrdinary(
    request:
      V1AcceptanceMemoryBridgeRequest,
  ):
    MissionMemoryRegistration {
    const registration =
      this.missionMemory.rememberCheckpoint(
        request.checkpoint,
        request.type,
      );

    return {
      ...registration,
      summary:
        request.summary,
      sourceReferences: [
        ...new Set([
          ...registration.sourceReferences,
          ...request.acceptance.evidenceIds,
          ...request.acceptance.verificationIds,
          ...request.sourceReferences,
        ]),
      ],
    };
  }

  private rememberAuthoritative(
    memory:
      MemoryReference,
    request:
      V1AcceptanceMemoryBridgeRequest,
  ):
    MissionMemoryRegistration {
    /*
     * The existing bridge promotes only explicit
     * authoritative mission decisions/plans.
     *
     * We therefore encode this accepted outcome as a
     * locked mission decision so the existing promotion
     * gate remains the sole authority.
     */
    const registration =
      this.missionMemory.rememberDecision(
        {
          id:
            memory.id,

          missionId:
            memory.missionId!,

          statement:
            request.summary,

          rationale:
            `Accepted outcome ${request.acceptance.id} was explicitly marked authoritative.`,

          authoritative:
            true,

          locked:
            true,

          sourceReferences:
            memory.sourceReferences,

          createdAt:
            memory.createdAt,

          updatedAt:
            memory.updatedAt,
        },
        request.type,
      );

    return registration;
  }
}
