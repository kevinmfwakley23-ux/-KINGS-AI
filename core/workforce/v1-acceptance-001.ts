import type {
  ID,
} from "./types";

import type {
  CompletionDecision,
} from "./completion-gate";

import type {
  EngineeringCompletionResult,
} from "./engineering-completion-authority";

export interface V1AcceptanceArtifactDecision {
  artifactId: ID;
  passed: boolean;
  evidenceIds: ID[];
  reasons: string[];
}

export interface V1AcceptanceReviewDecision {
  accepted: boolean;
  reasons: string[];
}

export interface V1AcceptanceRequest {
  taskId: ID;

  completion:
    CompletionDecision;

  engineeringCompletion?:
    EngineeringCompletionResult;

  artifactCompletion?:
    V1AcceptanceArtifactDecision;

  reviewAcceptance?:
    V1AcceptanceReviewDecision;
}

export interface V1AcceptanceDecision {
  id: ID;

  taskId: ID;

  accepted: boolean;

  reasons: string[];

  evidenceIds: ID[];

  verificationIds: ID[];

  componentDecisions: {
    completion: boolean;
    engineeringCompletion?:
      boolean;
    artifactCompletion?:
      boolean;
    reviewAcceptance?:
      boolean;
  };

  createdAt: string;
}

export class V1AcceptanceAuthority {
  evaluate(
    request:
      V1AcceptanceRequest,
  ):
    V1AcceptanceDecision {
    const reasons: string[] = [];

    const evidenceIds =
      new Set<ID>();

    const verificationIds =
      new Set<ID>();

    for (
      const evidenceId of
        request.completion.evidenceIds
    ) {
      evidenceIds.add(
        evidenceId,
      );
    }

    if (
      !request.completion.passed
    ) {
      reasons.push(
        ...request.completion.reasons.map(
          (reason) =>
            `Completion gate: ${reason}`,
        ),
      );
    }

    if (
      request.engineeringCompletion
    ) {
      if (
        !request.engineeringCompletion.completed
      ) {
        reasons.push(
          `Engineering completion: ${request.engineeringCompletion.reason}`,
        );
      }

      verificationIds.add(
        request.engineeringCompletion
          .verificationId,
      );

      for (
        const criterion of
          request.engineeringCompletion
            .unmetCriteria
      ) {
        reasons.push(
          `Engineering completion unmet criterion: ${criterion}`,
        );
      }
    }

    if (
      request.artifactCompletion
    ) {
      for (
        const evidenceId of
          request.artifactCompletion
            .evidenceIds
      ) {
        evidenceIds.add(
          evidenceId,
        );
      }

      if (
        !request.artifactCompletion.passed
      ) {
        reasons.push(
          ...request.artifactCompletion.reasons.map(
            (reason) =>
              `Artifact completion: ${reason}`,
          ),
        );
      }
    }

    if (
      request.reviewAcceptance
    ) {
      if (
        !request.reviewAcceptance.accepted
      ) {
        reasons.push(
          ...request.reviewAcceptance.reasons.map(
            (reason) =>
              `Review acceptance: ${reason}`,
          ),
        );
      }
    }

    return {
      id:
        `v1-acceptance-${request.taskId}`,

      taskId:
        request.taskId,

      accepted:
        reasons.length === 0,

      reasons,

      evidenceIds:
        [...evidenceIds],

      verificationIds:
        [...verificationIds],

      componentDecisions: {
        completion:
          request.completion.passed,

        ...(request.engineeringCompletion
          ? {
              engineeringCompletion:
                request.engineeringCompletion
                  .completed,
            }
          : {}),

        ...(request.artifactCompletion
          ? {
              artifactCompletion:
                request.artifactCompletion
                  .passed,
            }
          : {}),

        ...(request.reviewAcceptance
          ? {
              reviewAcceptance:
                request.reviewAcceptance
                  .accepted,
            }
          : {}),
      },

      createdAt:
        new Date().toISOString(),
    };
  }
}
