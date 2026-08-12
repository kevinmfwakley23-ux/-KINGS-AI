import {
  ArtifactRegistry,
} from "./artifact-registry";

import {
  ArtifactLifecycleAuthority,
} from "./artifact-lifecycle";

import {
  ArtifactCompletionAuthority,
} from "./artifact-completion";

import {
  ArtifactPromotionAuthority,
} from "./artifact-promotion";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function successfulVerification() {
  return {
    taskId:
      "task-tree-068",
    passed:
      true,
    startedAt:
      new Date().toISOString(),
    completedAt:
      new Date().toISOString(),
    steps: [
      {
        step: {
          id:
            "test",
          operation:
            "test" as const,
          command:
            "node",
          args: [
            "fixture.js",
          ],
          workingDirectory:
            "/tmp/tree-068",
        },
        execution: {
          command:
            "node",
          args: [
            "fixture.js",
          ],
          workingDirectory:
            "/tmp/tree-068",
          exitCode:
            0,
          signal:
            null,
          stdout:
            "PASS",
          stderr:
            "",
          timedOut:
            false,
          outputTruncated:
            false,
          startedAt:
            new Date().toISOString(),
          completedAt:
            new Date().toISOString(),
        },
        passed:
          true,
      },
    ],
  };
}

async function main(): Promise<void> {
  const registry =
    new ArtifactRegistry();

  const lifecycle =
    new ArtifactLifecycleAuthority(
      registry,
    );

  const completion =
    new ArtifactCompletionAuthority(
      registry,
    );

  const promotion =
    new ArtifactPromotionAuthority(
      registry,
      lifecycle,
      completion,
    );

  const now =
    new Date().toISOString();

  const artifact: any = {
    id:
      "artifact-tree-068",
    type:
      "code",
    name:
      "Tree 06.8 Promotion Artifact",
    description:
      "Artifact used to verify governed promotion.",
    location:
      "/tmp/tree-068/artifact.ts",
    version:
      "1",
    contentHash:
      "sha256:tree-068",
    createdByAgentId:
      "agent-tree-068",
    taskId:
      "task-tree-068",
    missionId:
      "mission-tree-068",
    createdAt:
      now,
  };

  registry.register(
    artifact,
  );

  lifecycle.registerCreated(
    artifact,
  );

  lifecycle.recordVerification(
    artifact.id,
    successfulVerification(),
  );

  const contract: any = {
    id:
      "work-unit-tree-068",
    role:
      "Promotion test worker",
    objective:
      "Promote only fully verified artifacts.",
    capabilityIds: [
      "coding",
    ],
    allowedToolIds: [],
    allowedPaths: [
      "/tmp/tree-068",
    ],
    budget: {
      maxTimeMs:
        60_000,
      maxTokens:
        10_000,
      maxIterations:
        1,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "Artifact completion evidence passes.",
    ],
    requiredEvidenceTypes: [
      "test",
    ],
    approved:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };

  const evidence: any = {
    id:
      "evidence-tree-068-test",
    type:
      "test",
    criterion:
      "Artifact completion evidence passes.",
    status:
      "passed",
    summary:
      "Promotion test passed.",
    verificationReference:
      "test:tree-068",
    createdAt:
      now,
  };

  const promoted =
    promotion.promote({
      taskId:
        "task-tree-068",
      artifactId:
        artifact.id,
      completion: {
        taskId:
          "task-tree-068",
        artifactId:
          artifact.id,
        contract,
        evidence: [
          evidence,
        ],
      },
    });

  assert(
    promoted.promoted,
    "A verified artifact must be promoted.",
  );

  assert(
    promoted.lifecycle.state ===
      "promoted",
    "Successful promotion must enter the promoted lifecycle state.",
  );

  const failedArtifact: any = {
    ...artifact,
    id:
      "artifact-tree-068-failed",
  };

  registry.register(
    failedArtifact,
  );

  lifecycle.registerCreated(
    failedArtifact,
  );

  lifecycle.recordFailureDiagnosis(
    failedArtifact.id,
    {
      id:
        "diagnosis-tree-068",
      taskId:
        "task-tree-068",
      workUnitId:
        "work-unit-tree-068",
      attempt:
        1,
      source:
        "test",
      kind:
        "verification-failed",
      summary:
        "Failed verification.",
      rootCauseCandidates: [
        "Fixture failure.",
      ],
      repairRecommendation:
        "Repair and rerun verification.",
      changedStrategyRequired:
        true,
      evidenceIds: [
        "evidence-failure-tree-068",
      ],
      createdAt:
        now,
    },
  );

  const rejected =
    promotion.promote({
      taskId:
        "task-tree-068",
      artifactId:
        failedArtifact.id,
      completion: {
        taskId:
          "task-tree-068",
        artifactId:
          failedArtifact.id,
        contract,
        evidence: [
          evidence,
        ],
      },
    });

  assert(
    !rejected.promoted,
    "Failed artifacts must not be promoted.",
  );

  assert(
    rejected.reasons.some(
      (reason) =>
        reason.includes(
          "failed lifecycle state",
        ),
    ),
    "Promotion rejection must preserve the failed lifecycle reason.",
  );

  let mismatchRejected =
    false;

  try {
    promotion.promote({
      taskId:
        "different-task",
      artifactId:
        artifact.id,
      completion: {
        taskId:
          "task-tree-068",
        artifactId:
          artifact.id,
        contract,
        evidence: [
          evidence,
        ],
      },
    });
  } catch {
    mismatchRejected =
      true;
  }

  assert(
    mismatchRejected,
    "Promotion must reject task/completion attribution mismatches.",
  );

  console.log(
    "06.8 verification-gated artifact promotion: SUCCESS",
  );

  console.log(
    "06.8 failed-artifact promotion rejection: SUCCESS",
  );

  console.log(
    "06.8 lifecycle state transition: SUCCESS",
  );

  console.log(
    "06.8 task/artifact attribution boundary: SUCCESS",
  );

  console.log(
    "TREE-06.8 ARTIFACT PROMOTION: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
