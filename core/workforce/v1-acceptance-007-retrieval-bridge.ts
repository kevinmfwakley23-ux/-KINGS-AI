import type {
  ID,
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

import {
  MemoryRetrievalExplainabilityAuthority,
  type ExplainableMemoryContextCandidate,
  type ExplainableContextSelection,
} from "./memory-health-007-retrieval-explainability";

import type {
  ContextBudgetPolicy,
} from "./memory-health-003-context-budget";

import type {
  GovernedMemoryRecord,
} from "./memory-health-002-enforcement";

export interface V1AcceptanceRetrievalBridgeRequest {
  acceptance:
    V1AcceptanceDecision;

  checkpoint:
    MissionCheckpoint;

  missionMemoryType:
    MemoryType;

  summary:
    string;

  sourceReferences:
    string[];

  relevance:
    number;

  priority:
    number;

  estimatedTokens:
    number;

  authoritative:
    boolean;

  contextPolicy:
    ContextBudgetPolicy;
}

export interface V1AcceptanceRetrievalBridgeResult {
  accepted:
    boolean;

  memoryRegistered:
    boolean;

  retrievalEvaluated:
    boolean;

  admitted:
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

  selection:
    ExplainableContextSelection;
}

export class V1AcceptanceRetrievalBridge {
  constructor(
    private readonly missionMemory:
      MissionMemoryBridge,

    private readonly retrievalExplainability:
      MemoryRetrievalExplainabilityAuthority,
  ) {}

  evaluate(
    request:
      V1AcceptanceRetrievalBridgeRequest,
  ):
    V1AcceptanceRetrievalBridgeResult {
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
      request.acceptance.evidenceIds.length ===
      0
    ) {
      reasons.push(
        "Accepted retrieval input requires evidence.",
      );
    }

    if (
      !request.summary.trim()
    ) {
      reasons.push(
        "Accepted retrieval input requires a summary.",
      );
    }

    if (
      !request.checkpoint.missionId.trim()
    ) {
      reasons.push(
        "Accepted retrieval input requires a mission id.",
      );
    }

    const registration =
      reasons.length === 0
        ? this.registerAcceptedMemory(
            request,
          )
        : this.emptyRegistration(
            request,
          );

    if (
      reasons.length > 0
    ) {
      return {
        accepted:
          false,

        memoryRegistered:
          false,

        retrievalEvaluated:
          false,

        admitted:
          false,

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

        reasons,

        registration,

        selection:
          this.emptySelection(
            request.contextPolicy,
          ),
      };
    }

    const record:
      GovernedMemoryRecord =
      this.toGovernedRecord(
        request,
        registration,
      );

    const candidate:
      ExplainableMemoryContextCandidate =
      {
        record,

        relevance:
          request.relevance,

        priority:
          request.priority,

        estimatedTokens:
          request.estimatedTokens,

        metadata: {
          provenance: [
            ...registration.sourceReferences,
          ],

          verificationEvidence: [
            ...request.acceptance
              .verificationIds,
          ],
        },
      };

    const selection =
      this.retrievalExplainability.explain(
        [candidate],
        request.contextPolicy,
      );

    const decision =
      selection.decisions.find(
        (item) =>
          item.memoryId ===
          registration.memoryId,
      );

    return {
      accepted:
        true,

      memoryRegistered:
        true,

      retrievalEvaluated:
        true,

      admitted:
        decision?.admitted === true,

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

      reasons:
        decision?.reason
          ? [
              decision.reason,
            ]
          : [],

      registration,

      selection,
    };
  }

  private registerAcceptedMemory(
    request:
      V1AcceptanceRetrievalBridgeRequest,
  ):
    MissionMemoryRegistration {
    /*
     * Accepted outcomes use the existing mission-memory
     * registration path. No direct MemoryStore writes occur.
     *
     * Explicit authoritative promotion remains governed by
     * V1-ACCEPTANCE-006 / MissionMemoryBridge.
     */
    return this.missionMemory.rememberCheckpoint(
      request.checkpoint,
      request.missionMemoryType,
    );
  }

  private toGovernedRecord(
    request:
      V1AcceptanceRetrievalBridgeRequest,

    registration:
      MissionMemoryRegistration,
  ):
    GovernedMemoryRecord {
    const authoritative =
      request.authoritative;

    const lifecycleClass =
      authoritative
        ? "authoritative"
        : "mission";

    const authority =
      authoritative
        ? "authoritative"
        : "verified";

    const requiresVerification =
      !authoritative;

    return {
      id:
        registration.memoryId,

      content:
        request.summary,

      lifecycle: {
        lifecycleClass,

        retention:
          "durable",

        authority,

        active:
          true,

        durable:
          true,

        requiresVerification,

        reason:
          "Accepted mission outcome passed through the governed memory lifecycle.",
      },

      createdAt:
        request.checkpoint.createdAt,

      updatedAt:
        request.checkpoint.state.updatedAt,
    };
  }

  private emptyRegistration(
    request:
      V1AcceptanceRetrievalBridgeRequest,
  ):
    MissionMemoryRegistration {
    return {
      memoryId:
        `MISSION-MEMORY-ACCEPTANCE-${request.acceptance.id}`,

      missionId:
        request.checkpoint.missionId,

      type:
        request.missionMemoryType,

      summary:
        request.summary,

      sourceReferences: [
        ...new Set([
          ...request.sourceReferences,
          ...request.acceptance.evidenceIds,
          ...request.acceptance.verificationIds,
        ]),
      ],

      authoritative:
        false,
    };
  }

  private emptySelection(
    policy:
      ContextBudgetPolicy,
  ):
    ExplainableContextSelection {
    return {
      records: [],

      decisions: [],

      estimatedTokens:
        0,

      budget:
        policy.maxTokens,

      admittedCount:
        0,

      rejectedCount:
        0,
    };
  }
}
