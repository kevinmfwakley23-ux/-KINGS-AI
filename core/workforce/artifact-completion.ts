import type {
  Artifact,
  ID,
} from "./types";

import type {
  CompletionEvidence,
} from "./completion-gate";

import {
  CompletionGate,
} from "./completion-gate";

import {
  ArtifactRegistry,
} from "./artifact-registry";

export interface ArtifactCompletionRequest {
  taskId: ID;
  artifactId: ID;
  contract: Parameters<
    CompletionGate["evaluate"]
  >[1];
  evidence: CompletionEvidence[];
}

export interface ArtifactCompletionResult {
  artifact: Artifact;
  passed: boolean;
  evidenceIds: ID[];
  reasons: string[];
}

export class ArtifactCompletionAuthority {
  constructor(
    private readonly artifacts:
      ArtifactRegistry,
    private readonly gate:
      CompletionGate =
        new CompletionGate(),
  ) {}

  evaluate(
    request:
      ArtifactCompletionRequest,
  ): ArtifactCompletionResult {
    const artifact =
      this.artifacts.get(
        request.artifactId,
      );

    if (!artifact) {
      throw new Error(
        `K.I.N.G.S. Artifact Completion: artifact "${request.artifactId}" was not found`,
      );
    }

    if (
      artifact.taskId &&
      artifact.taskId !==
        request.taskId
    ) {
      throw new Error(
        `K.I.N.G.S. Artifact Completion: artifact "${request.artifactId}" does not belong to task "${request.taskId}"`,
      );
    }

    const decision =
      this.gate.evaluate(
        request.taskId,
        request.contract,
        request.evidence,
      );

    return {
      artifact,
      passed:
        decision.passed,
      evidenceIds:
        decision.evidenceIds,
      reasons:
        decision.reasons,
    };
  }
}
