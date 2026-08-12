import type {
  ID,
  WorkforceResult,
} from "./types";

import type {
  EvidenceReviewResult,
} from "./evidence-review-authority";

import {
  ReviewRecordStore,
} from "./review-record-store";

import type {
  HumanReviewDecision,
} from "./review-authority";

export interface ReviewResultAcceptanceRequest {
  taskId:
    ID;
  result:
    WorkforceResult;
  machineReview:
    EvidenceReviewResult;
  humanReview:
    HumanReviewDecision;
}

export interface ReviewResultAcceptance {
  taskId:
    ID;
  accepted:
    boolean;
  result:
    WorkforceResult;
  reasons:
    string[];
  acceptedAt?:
    string;
}

export class ReviewResultAcceptanceAuthority {
  constructor(
    private readonly records:
      ReviewRecordStore,
  ) {}

  accept(
    request:
      ReviewResultAcceptanceRequest,
  ): ReviewResultAcceptance {
    const reasons:
      string[] = [];

    if (
      request.result.taskId !==
      request.taskId
    ) {
      reasons.push(
        "Workforce result task identity does not match the acceptance task.",
      );
    }

    if (
      request.machineReview.taskId !==
      request.taskId
    ) {
      reasons.push(
        "Machine review task identity does not match the acceptance task.",
      );
    }

    if (
      request.humanReview.taskId !==
      request.taskId
    ) {
      reasons.push(
        "Human review task identity does not match the acceptance task.",
      );
    }

    if (
      !request.machineReview.accepted
    ) {
      reasons.push(
        "Machine evidence review did not pass.",
      );
    }

    if (
      request.humanReview.status !==
      "approved"
    ) {
      reasons.push(
        "Owner approval is not in the approved state.",
      );
    }

    const stored =
      this.records.get(
        request.humanReview.id,
      );

    if (!stored) {
      reasons.push(
        "Human review record is not present in the durable review store.",
      );
    }

    return {
      taskId:
        request.taskId,
      accepted:
        reasons.length === 0,
      result:
        request.result,
      reasons,
      ...(reasons.length === 0
        ? {
            acceptedAt:
              new Date().toISOString(),
          }
        : {}),
    };
  }
}
