import {
  FailureDiagnosisAuthority,
} from "./failure-diagnosis";

import {
  FailureEscalationAuthority,
} from "./failure-escalation";

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

function execution(
  operation:
    "build" |
    "test",
  passed:
    boolean,
  stderr:
    string,
  exitCode:
    number,
) {
  return {
    taskId:
      "task-tree-066",
    passed:
      false,
    startedAt:
      new Date().toISOString(),
    completedAt:
      new Date().toISOString(),
    steps: [
      {
        step: {
          id:
            operation,
          operation,
          command:
            "node",
          args: [
            "fixture.js",
          ],
          workingDirectory:
            "/tmp/tree-066",
        },
        execution: {
          command:
            "node",
          args: [
            "fixture.js",
          ],
          workingDirectory:
            "/tmp/tree-066",
          exitCode,
          signal:
            null,
          stdout:
            "",
          stderr,
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
  const authority =
    new FailureDiagnosisAuthority(
      new FailureEscalationAuthority(),
    );

  const result =
    authority.diagnose({
      taskId:
        "task-tree-066",
      workUnitId:
        "WORK-UNIT-tree-066",
      attempt:
        1,
      execution:
        execution(
          "test",
          false,
          "Expected BUILD_OK but received BUILD_FAIL",
          1,
        ),
      evidenceIds: [
        "evidence-tree-066-test",
      ],
    });

  assert(
    result.diagnosis.kind ===
      "verification-failed",
    "Test failure must be classified as verification failure.",
  );

  assert(
    result.diagnosis.source ===
      "test",
    "Diagnosis must preserve the failed operation source.",
  );

  assert(
    result.diagnosis.rootCauseCandidates.length >
      0,
    "Diagnosis must produce root-cause candidates.",
  );

  assert(
    result.diagnosis.repairRecommendation.includes(
      "materially different correction",
    ),
    "Verification failure diagnosis must recommend a changed repair strategy.",
  );

  assert(
    result.diagnosis.changedStrategyRequired,
    "Verification failures must require a materially different strategy.",
  );

  assert(
    result.diagnosis.evidenceIds.includes(
      "evidence-tree-066-test",
    ),
    "Diagnosis must preserve evidence linkage.",
  );

  assert(
    result.escalation.decision.action ===
      "repair",
    "Verification failure should produce a bounded repair decision under the default policy.",
  );

  assert(
    !!result.escalation.decision.repairWorkUnit,
    "Repair decision must produce a repair Work Unit.",
  );

  const authorization =
    authority.diagnose({
      taskId:
        "task-tree-066",
      workUnitId:
        "WORK-UNIT-tree-066",
      attempt:
        1,
      execution:
        execution(
          "build",
          false,
          "permission denied",
          1,
        ),
      additionalDetails: [
        "Authorization boundary failure.",
      ],
    });

  const authorizationEscalation =
    new FailureEscalationAuthority()
      .evaluate({
        taskId:
          "task-tree-066",
        workUnitId:
          "WORK-UNIT-tree-066",
        kind:
          "authorization-failed",
        summary:
          "Authorization failure",
        details: [
          "permission denied",
        ],
        attempt:
          1,
      });

  assert(
    authorization.diagnosis.kind ===
      "unknown",
    "Unmarked build failure must remain unknown until stronger evidence establishes a more specific cause.",
  );

  assert(
    authorizationEscalation.decision.action ===
      "escalate",
    "Authorization failures must escalate rather than retry.",
  );

  const timeout =
    authority.diagnose({
      taskId:
        "task-tree-066",
      workUnitId:
        "WORK-UNIT-tree-066",
      attempt:
        1,
      execution: {
        taskId:
          "task-tree-066",
        passed:
          false,
        startedAt:
          new Date().toISOString(),
        completedAt:
          new Date().toISOString(),
        steps: [
          {
            step: {
              id:
                "build-timeout",
              operation:
                "build",
              command:
                "node",
              args:
                [],
              workingDirectory:
                "/tmp/tree-066",
            },
            execution: {
              command:
                "node",
              args:
                [],
              workingDirectory:
                "/tmp/tree-066",
              exitCode:
                null,
              signal:
                "SIGTERM",
              stdout:
                "",
              stderr:
                "",
              timedOut:
                true,
              outputTruncated:
                false,
              startedAt:
                new Date().toISOString(),
              completedAt:
                new Date().toISOString(),
            },
            passed:
              false,
          },
        ],
      },
    });

  assert(
    timeout.diagnosis.kind ===
      "transient-execution",
    "Timeouts must be classified as transient execution failures.",
  );

  console.log(
    "06.6 deterministic failure source classification: SUCCESS",
  );

  console.log(
    "06.6 root-cause candidate generation: SUCCESS",
  );

  console.log(
    "06.6 evidence linkage preservation: SUCCESS",
  );

  console.log(
    "06.6 repair recommendation generation: SUCCESS",
  );

  console.log(
    "06.6 escalation integration: SUCCESS",
  );

  console.log(
    "06.6 authorization non-retry boundary: SUCCESS",
  );

  console.log(
    "06.6 timeout classification: SUCCESS",
  );

  console.log(
    "TREE-06.6 FAILURE DIAGNOSIS: SUCCESS",
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
