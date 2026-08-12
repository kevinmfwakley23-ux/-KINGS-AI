import type {
  ID,
  WorkforceResult,
} from "./types";

import type {
  EvidenceReviewRequest,
  EvidenceReviewResult,
  EvidenceReviewAuthority,
} from "./evidence-review-authority";

import {
  ReviewRecordStore,
} from "./review-record-store";

export type ReviewDecisionStatus =
  | "pending-human-review"
  | "approved"
  | "rejected";

export interface HumanReviewDecision {
  id:
    ID;
  taskId:
    ID;
  reviewerId:
    ID;
  status:
    ReviewDecisionStatus;
  reason:
    string;
  approvedAt?:
    string;
  createdAt:
    string;
}

export interface GovernedReviewRequest {
  taskId:
    ID;
  reviewerId:
    ID;
  review:
    EvidenceReviewRequest;
  workforceResult?:
    WorkforceResult;
  requireHumanApproval:
    boolean;
}

export interface GovernedReviewResult {
  taskId:
    ID;
  machineReview:
    EvidenceReviewResult;
  humanReview:
    HumanReviewDecision;
  accepted:
    boolean;
}

export class ReviewAuthority {
  private readonly decisions =
    new Map<
      ID,
      HumanReviewDecision
    >();

  constructor(
    private readonly evidenceReview:
      EvidenceReviewAuthority,
    private readonly records:
      ReviewRecordStore =
      new ReviewRecordStore(),
  ) {}

  review(
    request:
      GovernedReviewRequest,
  ): GovernedReviewResult {
    if (
      !request.taskId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Review Authority: task id is required",
      );
    }

    if (
      !request.reviewerId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Review Authority: reviewer id is required",
      );
    }

    const machineReview =
      this.evidenceReview.review({
        ...request.review,
        workforceResult:
          request.workforceResult ??
          request.review.workforceResult,
      });

    if (
      !machineReview.accepted
    ) {
      const humanReview =
        this.recordDecision({
          id:
            `review-${request.taskId}-${Date.now()}`,
          taskId:
            request.taskId,
          reviewerId:
            request.reviewerId,
          status:
            "rejected",
          reason:
            machineReview.reasons.join(
              " ",
            ) ||
            "Machine evidence review failed.",
          createdAt:
            new Date().toISOString(),
        });

      return {
        taskId:
          request.taskId,
        machineReview,
        humanReview,
        accepted:
          false,
      };
    }

    if (
      request.requireHumanApproval
    ) {
      const humanReview =
        this.recordDecision({
          id:
            `review-${request.taskId}-${Date.now()}`,
          taskId:
            request.taskId,
          reviewerId:
            request.reviewerId,
          status:
            "pending-human-review",
          reason:
            "Machine review passed; explicit human approval is still required.",
          createdAt:
            new Date().toISOString(),
        });

      return {
        taskId:
          request.taskId,
        machineReview,
        humanReview,
        accepted:
          false,
      };
    }

    const humanReview =
      this.recordDecision({
        id:
          `review-${request.taskId}-${Date.now()}`,
        taskId:
          request.taskId,
        reviewerId:
          request.reviewerId,
        status:
          "approved",
        reason:
          "Machine review passed and no human approval gate was required.",
        approvedAt:
          new Date().toISOString(),
        createdAt:
          new Date().toISOString(),
      });

    return {
      taskId:
        request.taskId,
      machineReview,
      humanReview,
      accepted:
        true,
    };
  }

  approve(
    reviewId:
      ID,
    reviewerId:
      ID,
    reason:
      string,
  ): HumanReviewDecision {
    const existing =
      this.decisions.get(
        reviewId,
      );

    if (!existing) {
      throw new Error(
        `K.I.N.G.S. Review Authority: review "${reviewId}" was not found`,
      );
    }

    if (
      existing.reviewerId !==
      reviewerId
    ) {
      throw new Error(
        "K.I.N.G.S. Review Authority: reviewer does not own this approval boundary",
      );
    }

    if (
      existing.status !==
      "pending-human-review"
    ) {
      throw new Error(
        `K.I.N.G.S. Review Authority: review "${reviewId}" is not awaiting human approval`,
      );
    }

    if (
      !reason.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Review Authority: approval reason is required",
      );
    }

    return this.recordDecision({
      ...existing,
      status:
        "approved",
      reason:
        reason.trim(),
      approvedAt:
        new Date().toISOString(),
    });
  }

  reject(
    reviewId:
      ID,
    reviewerId:
      ID,
    reason:
      string,
  ): HumanReviewDecision {
    const existing =
      this.decisions.get(
        reviewId,
      );

    if (!existing) {
      throw new Error(
        `K.I.N.G.S. Review Authority: review "${reviewId}" was not found`,
      );
    }

    if (
      existing.reviewerId !==
      reviewerId
    ) {
      throw new Error(
        "K.I.N.G.S. Review Authority: reviewer does not own this approval boundary",
      );
    }

    if (
      existing.status !==
      "pending-human-review"
    ) {
      throw new Error(
        `K.I.N.G.S. Review Authority: review "${reviewId}" is not awaiting human review`,
      );
    }

    if (
      !reason.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Review Authority: rejection reason is required",
      );
    }

    return this.recordDecision({
      ...existing,
      status:
        "rejected",
      reason:
        reason.trim(),
    });
  }

  get(
    reviewId:
      ID,
  ):
    HumanReviewDecision |
    undefined {
    const decision =
      this.decisions.get(
        reviewId,
      );

    return decision
      ? {
          ...decision,
        }
      : undefined;
  }

  list():
    HumanReviewDecision[] {
    return [
      ...this.decisions.values(),
    ].map(
      (decision) => ({
        ...decision,
      }),
    );
  }

  private recordDecision(
    decision:
      HumanReviewDecision,
  ): HumanReviewDecision {
    this.decisions.set(
      decision.id,
      {
        ...decision,
      },
    );

    const existing =
      this.records.get(
        decision.id,
      );

    if (
      existing
    ) {
      this.records.update(
        decision,
      );
    } else {
      this.records.save(
        decision,
      );
    }

    return {
      ...decision,
    };
  }
}
