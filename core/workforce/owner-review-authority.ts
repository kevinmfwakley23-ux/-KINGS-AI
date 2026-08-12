import type {
  ID,
} from "./types";

import {
  ReviewAuthority,
  type GovernedReviewRequest,
  type GovernedReviewResult,
  type HumanReviewDecision,
} from "./review-authority";

export interface OwnerIdentity {
  id:
    ID;
  displayName:
    string;
  role:
    "owner";
}

export interface OwnerReviewRequest
  extends GovernedReviewRequest {
  owner:
    OwnerIdentity;
}

export interface OwnerReviewResult {
  owner:
    OwnerIdentity;
  review:
    GovernedReviewResult;
}

export class OwnerReviewAuthority {
  constructor(
    private readonly owner:
      OwnerIdentity,
    private readonly reviewAuthority:
      ReviewAuthority,
  ) {
    if (
      owner.role !==
      "owner"
    ) {
      throw new Error(
        "K.I.N.G.S. Owner Review Authority: only an owner identity may initialize owner review authority",
      );
    }

    if (
      !owner.id.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Owner Review Authority: owner id is required",
      );
    }
  }

  review(
    request:
      OwnerReviewRequest,
  ): OwnerReviewResult {
    this.assertOwner(
      request.owner,
    );

    const review =
      this.reviewAuthority.review(
        {
          ...request,
          reviewerId:
            this.owner.id,
        },
      );

    return {
      owner: {
        ...this.owner,
      },
      review,
    };
  }

  approve(
    reviewId:
      ID,
    ownerId:
      ID,
    reason:
      string,
  ): HumanReviewDecision {
    this.assertOwnerId(
      ownerId,
    );

    return this.reviewAuthority.approve(
      reviewId,
      this.owner.id,
      reason,
    );
  }

  reject(
    reviewId:
      ID,
    ownerId:
      ID,
    reason:
      string,
  ): HumanReviewDecision {
    this.assertOwnerId(
      ownerId,
    );

    return this.reviewAuthority.reject(
      reviewId,
      this.owner.id,
      reason,
    );
  }

  list():
    HumanReviewDecision[] {
    return this.reviewAuthority.list();
  }

  private assertOwner(
    owner:
      OwnerIdentity,
  ): void {
    if (
      owner.role !==
      "owner" ||
      owner.id !==
        this.owner.id
    ) {
      throw new Error(
        "K.I.N.G.S. Owner Review Authority: review request is not authorized by the configured owner",
      );
    }
  }

  private assertOwnerId(
    ownerId:
      ID,
  ): void {
    if (
      ownerId !==
      this.owner.id
    ) {
      throw new Error(
        "K.I.N.G.S. Owner Review Authority: caller is not the configured owner",
      );
    }
  }
}
