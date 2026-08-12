import type {
  ID,
  Artifact,
} from "./types";

import {
  ArtifactRegistry,
} from "./artifact-registry";

import {
  ArtifactLifecycleAuthority,
  type ArtifactLifecycleRecord,
} from "./artifact-lifecycle";

import {
  ArtifactCompletionAuthority,
  type ArtifactCompletionRequest,
} from "./artifact-completion";

export interface ArtifactPromotionRequest {
  taskId:
    ID;
  artifactId:
    ID;
  completion:
    ArtifactCompletionRequest;
}

export interface ArtifactPromotionResult {
  promoted:
    boolean;
  artifact:
    Artifact;
  lifecycle:
    ArtifactLifecycleRecord;
  reasons:
    string[];
}

export class ArtifactPromotionAuthority {
  constructor(
    private readonly artifacts:
      ArtifactRegistry,
    private readonly lifecycle:
      ArtifactLifecycleAuthority,
    private readonly completion:
      ArtifactCompletionAuthority,
  ) {}

  promote(
    request:
      ArtifactPromotionRequest,
  ): ArtifactPromotionResult {
    const artifact =
      this.artifacts.get(
        request.artifactId,
      );

    if (!artifact) {
      throw new Error(
        `K.I.N.G.S. Artifact Promotion: artifact "${request.artifactId}" was not found`,
      );
    }

    if (
      request.completion.taskId !==
      request.taskId
    ) {
      throw new Error(
        "K.I.N.G.S. Artifact Promotion: completion task does not match promotion task",
      );
    }

    if (
      request.completion.artifactId !==
      request.artifactId
    ) {
      throw new Error(
        "K.I.N.G.S. Artifact Promotion: completion artifact does not match promotion artifact",
      );
    }

    const lifecycleRecord =
      this.lifecycle.get(
        request.artifactId,
      );

    if (!lifecycleRecord) {
      throw new Error(
        `K.I.N.G.S. Artifact Promotion: artifact "${request.artifactId}" has no lifecycle record`,
      );
    }

    if (
      lifecycleRecord.state ===
      "failed"
    ) {
      return {
        promoted:
          false,
        artifact,
        lifecycle:
          lifecycleRecord,
        reasons: [
          "Artifact remains in a failed lifecycle state.",
        ],
      };
    }

    const completion =
      this.completion.evaluate(
        request.completion,
      );

    if (
      !completion.passed
    ) {
      return {
        promoted:
          false,
        artifact,
        lifecycle:
          lifecycleRecord,
        reasons:
          completion.reasons.length >
          0
            ? completion.reasons
            : [
                "Artifact completion gate did not pass.",
              ],
      };
    }

    if (
      lifecycleRecord.state !==
      "ready-for-promotion"
    ) {
      return {
        promoted:
          false,
        artifact,
        lifecycle:
          lifecycleRecord,
        reasons: [
          `Artifact lifecycle state "${lifecycleRecord.state}" is not ready for promotion.`,
        ],
      };
    }

    if (
      lifecycleRecord.verificationReferences
        .length ===
      0
    ) {
      return {
        promoted:
          false,
        artifact,
        lifecycle:
          lifecycleRecord,
        reasons: [
          "Artifact has no recorded verification references.",
        ],
      };
    }

    const decision =
      this.artifacts.promote(
        request.artifactId,
        lifecycleRecord.verificationReferences,
      );

    if (
      !decision.promoted
    ) {
      return {
        promoted:
          false,
        artifact,
        lifecycle:
          lifecycleRecord,
        reasons:
          decision.reasons,
      };
    }

    lifecycleRecord.state =
      "promoted";
    lifecycleRecord.updatedAt =
      new Date().toISOString();

    return {
      promoted:
        true,
      artifact,
      lifecycle: {
        ...lifecycleRecord,
        verificationReferences: [
          ...lifecycleRecord.verificationReferences,
        ],
        failureDiagnosisIds: [
          ...lifecycleRecord.failureDiagnosisIds,
        ],
      },
      reasons: [],
    };
  }
}
