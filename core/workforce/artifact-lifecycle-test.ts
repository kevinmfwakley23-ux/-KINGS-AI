import {
  ArtifactRegistry,
} from "./artifact-registry";

import {
  ArtifactLifecycleAuthority,
} from "./artifact-lifecycle";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function verification(
  passed:
    boolean,
): import("./build-test-executor").BuildTestExecutionResult {
  return {
    taskId:
      "task-tree-067",
    passed,
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
            "test",
          command:
            "node",
          args:
            [
              "fixture.js",
            ],
          workingDirectory:
            "/tmp/tree-067",
        },
        execution: {
          command:
            "node",
          args:
            [
              "fixture.js",
            ],
          workingDirectory:
            "/tmp/tree-067",
          exitCode:
            passed
              ? 0
              : 1,
          signal:
            null,
          stdout:
            passed
              ? "PASS"
              : "",
          stderr:
            passed
              ? ""
              : "FAIL",
          timedOut:
            false,
          outputTruncated:
            false,
          startedAt:
            new Date().toISOString(),
          completedAt:
            new Date().toISOString(),
        },
        passed,
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

  const now =
    new Date().toISOString();

  const artifact: any = {
    id:
      "artifact-tree-067",
    type:
      "code",
    name:
      "Tree 06.7 Artifact",
    description:
      "Artifact lifecycle management test artifact.",
    location:
      "/tmp/tree-067/artifact.ts",
    version:
      "1",
    contentHash:
      "sha256:tree-067",
    createdByAgentId:
      "agent-tree-067",
    taskId:
      "task-tree-067",
    missionId:
      "mission-tree-067",
    createdAt:
      now,
  };

  const created =
    lifecycle.registerCreated(
      artifact,
    );

  assert(
    created.lifecycle.state ===
      "created",
    "Created artifacts must start in the created lifecycle state.",
  );

  const validated =
    lifecycle.recordVerification(
      artifact.id,
      verification(
        true,
      ),
    );

  assert(
    validated.lifecycle.state ===
      "ready-for-promotion",
    "Passing verification must make an artifact ready for promotion.",
  );

  assert(
    validated.lifecycle.verificationReferences.length ===
      1,
    "Artifact verification references must be recorded.",
  );

  const failure =
    lifecycle.recordFailureDiagnosis(
      artifact.id,
      {
        id:
          "diagnosis-tree-067",
        taskId:
          "task-tree-067",
        workUnitId:
          "WORK-UNIT-tree-067",
        attempt:
          1,
        source:
          "test",
        kind:
          "verification-failed",
        summary:
          "Test failure recorded.",
        rootCauseCandidates: [
          "Fixture failure.",
        ],
        repairRecommendation:
          "Correct the fixture and rerun the test.",
        changedStrategyRequired:
          true,
        evidenceIds: [
          "evidence-tree-067",
        ],
        createdAt:
          now,
      },
    );

  assert(
    failure.lifecycle.state ===
      "failed",
    "Failure diagnosis must move the artifact lifecycle into failed state.",
  );

  assert(
    failure.lifecycle.failureDiagnosisIds.includes(
      "diagnosis-tree-067",
    ),
    "Failure diagnosis identity must be preserved.",
  );

  const repaired =
    lifecycle.recordVerification(
      artifact.id,
      verification(
        true,
      ),
    );

  assert(
    repaired.lifecycle.state ===
      "ready-for-promotion",
    "A later passing verification must restore promotion readiness.",
  );

  const stored =
    lifecycle.get(
      artifact.id,
    );

  assert(
    stored?.taskId ===
      "task-tree-067",
    "Task provenance must remain attached to the lifecycle record.",
  );

  assert(
    stored?.missionId ===
      "mission-tree-067",
    "Mission provenance must remain attached to the lifecycle record.",
  );

  console.log(
    "06.7 artifact lifecycle creation: SUCCESS",
  );

  console.log(
    "06.7 verification evidence management: SUCCESS",
  );

  console.log(
    "06.7 failure diagnosis linkage: SUCCESS",
  );

  console.log(
    "06.7 artifact provenance preservation: SUCCESS",
  );

  console.log(
    "06.7 artifact revalidation after repair: SUCCESS",
  );

  console.log(
    "TREE-06.7 ARTIFACT MANAGEMENT: SUCCESS",
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
