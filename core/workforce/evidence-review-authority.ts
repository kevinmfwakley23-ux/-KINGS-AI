import type {
  ID,
  WorkforceResult,
} from "./types";

import {
  EvidenceStore,
} from "./evidence-store";

import {
  VerificationAuthority,
  type VerificationSummary,
} from "./verification-authority";

import {
  CompletionGate,
  type CompletionDecision,
  type CompletionEvidence,
} from "./completion-gate";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

export interface EvidenceReviewRequest {
  taskId:
    ID;
  contract:
    WorkUnitContract;
  evidenceIds:
    ID[];
  workforceResult?:
    WorkforceResult;
}

export interface EvidenceReviewResult {
  taskId:
    ID;
  accepted:
    boolean;
  verification:
    VerificationSummary;
  completion:
    CompletionDecision;
  evidence:
    CompletionEvidence[];
  reasons:
    string[];
  reviewedAt:
    string;
}

export class EvidenceReviewAuthority {
  constructor(
    private readonly evidenceStore:
      EvidenceStore,
    private readonly verification:
      VerificationAuthority,
    private readonly completion:
      CompletionGate =
      new CompletionGate(),
  ) {}

  review(
    request:
      EvidenceReviewRequest,
  ): EvidenceReviewResult {
    if (
      !request.taskId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Evidence Review: task id is required",
      );
    }

    if (
      !request.contract.approved
    ) {
      return this.createRejected(
        request.taskId,
        "Work Unit contract is not approved.",
      );
    }

    const evidence =
      request.evidenceIds.map(
        (evidenceId) =>
          this.evidenceStore.get(
            evidenceId,
          ),
      );

    const missing =
      request.evidenceIds.filter(
        (
          _evidence,
          index,
        ) =>
          !evidence[index],
      );

    if (
      missing.length > 0
    ) {
      return this.createRejected(
        request.taskId,
        `Evidence is missing: ${missing.join(", ")}`,
      );
    }

    const loadedEvidence =
      evidence.filter(
        (
          item,
        ): item is CompletionEvidence =>
          item !== undefined,
      );

    const wrongTaskEvidence =
      loadedEvidence.filter(
        (item) => {
          const typed =
            item as CompletionEvidence &
              {
                taskId?:
                  ID;
              };

          return (
            typed.taskId !==
              undefined &&
            typed.taskId !==
              request.taskId
          );
        },
      );

    if (
      wrongTaskEvidence.length >
      0
    ) {
      return this.createRejected(
        request.taskId,
        "Evidence contains records attributed to a different task.",
      );
    }

    const verificationResult =
      this.verification.verifyAll(
        request.evidenceIds,
      );

    const completionResult =
      this.completion.evaluate(
        request.taskId,
        request.contract,
        loadedEvidence,
      );

    const reasons: string[] = [
      ...verificationResult.reasons,
      ...completionResult.reasons,
    ];

    if (
      request.workforceResult &&
      request.workforceResult.taskId !==
        request.taskId
    ) {
      reasons.push(
        "Workforce result task identity does not match the review task.",
      );
    }

    if (
      loadedEvidence.some(
        (item) =>
          item.status ===
          "failed",
      )
    ) {
      reasons.push(
        "Review contains failed evidence.",
      );
    }

    return {
      taskId:
        request.taskId,
      accepted:
        verificationResult.verified &&
        completionResult.passed &&
        reasons.length === 0,
      verification:
        verificationResult,
      completion:
        completionResult,
      evidence:
        loadedEvidence,
      reasons: [
        ...new Set(
          reasons,
        ),
      ],
      reviewedAt:
        new Date().toISOString(),
    };
  }

  private createRejected(
    taskId:
      ID,
    reason:
      string,
  ): EvidenceReviewResult {
    return {
      taskId,
      accepted:
        false,
      verification: {
        verified:
          false,
        evidence: [],
        results: [],
        reasons: [
          reason,
        ],
      },
      completion: {
        taskId,
        passed:
          false,
        reasons: [
          reason,
        ],
        evidenceIds: [],
      },
      evidence: [],
      reasons: [
        reason,
      ],
      reviewedAt:
        new Date().toISOString(),
    };
  }
}
