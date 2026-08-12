import type {
  ID,
  WorkforceResult,
} from "./types";

import {
  ReviewRuntimeContextAuthority,
  type ReviewRuntimeContext,
} from "./review-runtime-context";

import {
  ReviewRecordStore,
} from "./review-record-store";

import {
  ReviewResultAcceptanceAuthority,
  type ReviewResultAcceptance,
} from "./review-result-acceptance";

import type {
  EvidenceReviewResult,
} from "./evidence-review-authority";

export interface ReviewRuntimeHandoffRequest {
  taskId:
    ID;
  ownerId:
    ID;
  ownerLogin:
    string;
  sessionId:
    ID;
  reviewId:
    ID;
  workforceResult:
    WorkforceResult;
  evidenceReview:
    EvidenceReviewResult;
}

export interface ReviewRuntimeHandoffResult {
  context:
    ReviewRuntimeContext;
  acceptance:
    ReviewResultAcceptance;
  accepted:
    boolean;
  reasons:
    string[];
}

export class ReviewRuntimeHandoffAuthority {
  constructor(
    private readonly runtimeContext:
      ReviewRuntimeContextAuthority,
    private readonly records:
      ReviewRecordStore,
    private readonly resultAcceptance:
      ReviewResultAcceptanceAuthority,
  ) {}

  handoff(
    request:
      ReviewRuntimeHandoffRequest,
  ): ReviewRuntimeHandoffResult {
    const context =
      this.runtimeContext.resolve({
        ownerLogin:
          request.ownerLogin,
        sessionId:
          request.sessionId,
      });

    const reasons:
      string[] = [];

    if (
      context.owner.id !==
      request.ownerId
    ) {
      reasons.push(
        "Authenticated owner does not match the requested owner.",
      );
    }

    const stored =
      this.records.get(
        request.reviewId,
      );

    if (!stored) {
      reasons.push(
        "Review approval record was not found.",
      );
    }

    if (
      stored &&
      stored.taskId !==
        request.taskId
    ) {
      reasons.push(
        "Stored review task identity does not match the handoff task.",
      );
    }

    if (
      stored &&
      stored.reviewerId !==
        context.owner.id
    ) {
      reasons.push(
        "Stored review reviewer is not the authenticated owner.",
      );
    }

    if (
      stored &&
      stored.status !==
        "approved"
    ) {
      reasons.push(
        "Stored review is not approved.",
      );
    }

    if (
      request.evidenceReview.taskId !==
      request.taskId
    ) {
      reasons.push(
        "Evidence review task identity does not match the handoff task.",
      );
    }

    if (
      reasons.length > 0
    ) {
      return {
        context,
        acceptance: {
          taskId:
            request.taskId,
          accepted:
            false,
          result:
            request.workforceResult,
          reasons: [
            ...reasons,
          ],
        },
        accepted:
          false,
        reasons: [
          ...reasons,
        ],
      };
    }

    const acceptance =
      this.resultAcceptance.accept({
        taskId:
          request.taskId,
        result:
          request.workforceResult,
        machineReview:
          request.evidenceReview,
        humanReview:
          stored!,
      });

    return {
      context,
      acceptance,
      accepted:
        acceptance.accepted,
      reasons: [
        ...acceptance.reasons,
      ],
    };
  }
}
