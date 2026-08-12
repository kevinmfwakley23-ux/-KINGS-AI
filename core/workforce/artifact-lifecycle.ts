import type {
  ID,
  Artifact,
} from "./types";

import {
  ArtifactRegistry,
} from "./artifact-registry";

import type {
  BuildTestExecutionResult,
} from "./build-test-executor";

import type {
  FailureDiagnosisRecord,
} from "./failure-diagnosis";

export type ArtifactLifecycleState =
  | "created"
  | "validated"
  | "failed"
  | "ready-for-promotion"
  | "promoted";

export interface ArtifactLifecycleRecord {
  artifactId:
    ID;
  taskId?:
    ID;
  missionId?:
    ID;
  state:
    ArtifactLifecycleState;
  verificationReferences:
    string[];
  failureDiagnosisIds:
    ID[];
  createdAt:
    string;
  updatedAt:
    string;
}

export interface ArtifactLifecycleResult {
  artifact:
    Artifact;
  lifecycle:
    ArtifactLifecycleRecord;
}

export class ArtifactLifecycleAuthority {
  private readonly records =
    new Map<
      ID,
      ArtifactLifecycleRecord
    >();

  constructor(
    private readonly registry:
      ArtifactRegistry,
  ) {}

  registerCreated(
    artifact:
      Artifact,
  ): ArtifactLifecycleResult {
    this.registry.get(
      artifact.id,
    ) ??
      this.registry.register(
        artifact,
      );

    const lifecycle:
      ArtifactLifecycleRecord =
      {
        artifactId:
          artifact.id,
        taskId:
          artifact.taskId,
        missionId:
          artifact.missionId,
        state:
          "created",
        verificationReferences: [],
        failureDiagnosisIds: [],
        createdAt:
          new Date().toISOString(),
        updatedAt:
          new Date().toISOString(),
      };

    this.records.set(
      artifact.id,
      lifecycle,
    );

    return {
      artifact,
      lifecycle,
    };
  }

  recordVerification(
    artifactId:
      ID,
    verification:
      BuildTestExecutionResult,
  ): ArtifactLifecycleResult {
    const artifact =
      this.requireArtifact(
        artifactId,
      );

    const lifecycle =
      this.requireLifecycle(
        artifactId,
      );

    const references =
      verification.steps.map(
        (step) =>
          `build-test:${verification.taskId}:${step.step.id}:${step.execution.exitCode}`,
      );

    lifecycle.verificationReferences = [
      ...new Set(
        [
          ...lifecycle.verificationReferences,
          ...references,
        ],
      ),
    ];

    lifecycle.state =
      verification.passed
        ? "validated"
        : "failed";

    lifecycle.updatedAt =
      new Date().toISOString();

    if (
      verification.passed
    ) {
      lifecycle.state =
        "ready-for-promotion";
    }

    return {
      artifact,
      lifecycle: {
        ...lifecycle,
        verificationReferences: [
          ...lifecycle.verificationReferences,
        ],
        failureDiagnosisIds: [
          ...lifecycle.failureDiagnosisIds,
        ],
      },
    };
  }

  recordFailureDiagnosis(
    artifactId:
      ID,
    diagnosis:
      FailureDiagnosisRecord,
  ): ArtifactLifecycleResult {
    const artifact =
      this.requireArtifact(
        artifactId,
      );

    const lifecycle =
      this.requireLifecycle(
        artifactId,
      );

    lifecycle.failureDiagnosisIds = [
      ...new Set(
        [
          ...lifecycle.failureDiagnosisIds,
          diagnosis.id,
        ],
      ),
    ];

    lifecycle.state =
      "failed";

    lifecycle.updatedAt =
      new Date().toISOString();

    return {
      artifact,
      lifecycle: {
        ...lifecycle,
        verificationReferences: [
          ...lifecycle.verificationReferences,
        ],
        failureDiagnosisIds: [
          ...lifecycle.failureDiagnosisIds,
        ],
      },
    };
  }

  get(
    artifactId:
      ID,
  ):
    ArtifactLifecycleRecord |
    undefined {
    const lifecycle =
      this.records.get(
        artifactId,
      );

    return lifecycle
      ? {
          ...lifecycle,
          verificationReferences: [
            ...lifecycle.verificationReferences,
          ],
          failureDiagnosisIds: [
            ...lifecycle.failureDiagnosisIds,
          ],
        }
      : undefined;
  }

  list():
    ArtifactLifecycleRecord[] {
    return [
      ...this.records.values(),
    ].map(
      (lifecycle) => ({
        ...lifecycle,
        verificationReferences: [
          ...lifecycle.verificationReferences,
        ],
        failureDiagnosisIds: [
          ...lifecycle.failureDiagnosisIds,
        ],
      }),
    );
  }

  private requireArtifact(
    artifactId:
      ID,
  ): Artifact {
    const artifact =
      this.registry.get(
        artifactId,
      );

    if (!artifact) {
      throw new Error(
        `K.I.N.G.S. Artifact Lifecycle: artifact "${artifactId}" not found`,
      );
    }

    return artifact;
  }

  private requireLifecycle(
    artifactId:
      ID,
  ): ArtifactLifecycleRecord {
    const lifecycle =
      this.records.get(
        artifactId,
      );

    if (!lifecycle) {
      throw new Error(
        `K.I.N.G.S. Artifact Lifecycle: artifact "${artifactId}" has no lifecycle record`,
      );
    }

    return lifecycle;
  }
}
