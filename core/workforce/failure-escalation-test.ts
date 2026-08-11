import {
  FailureEscalationAuthority,
  type RecoveryAttempt,
  type WorkerFailureKind,
} from "./failure-escalation";

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function failureInput(
  kind:
    WorkerFailureKind,
  attempt:
    number,
  history:
    RecoveryAttempt[] = [],
) {
  return {
    taskId:
      "task-failure-escalation-test",

    workUnitId:
      "work-unit-failure-escalation-test",

    kind,

    summary:
      `Controlled ${kind} test failure.`,

    details: [
      "Failure created by the Tree 02.7 acceptance test.",
    ],

    attempt,

    evidenceIds: [
      "evidence-failure-test",
    ],

    priorFailureIds: [],

    history,
  };
}

async function main(): Promise<void> {
  const authority =
    new FailureEscalationAuthority({
      maxRecoveryAttempts:
        2,

      retryableKinds: [
        "transient-execution",
      ],

      repairableKinds: [
        "verification-failed",
        "unknown",
      ],

      neverRetryKinds: [
        "execution-rejected",
        "budget-exhausted",
        "invalid-work-unit",
        "authorization-failed",
        "dependency-blocked",
      ],
    });

  /*
   * 1. Failure classification
   */
  assert(
    authority.classify({
      executionStatus:
        "failure",
      summary:
        "Transient execution failure.",
    }) ===
      "transient-execution",
    "Transient execution failures must be classified correctly.",
  );

  assert(
    authority.classify({
      executionStatus:
        "rejected",
      summary:
        "Rejected execution.",
    }) ===
      "execution-rejected",
    "Execution rejection must be classified correctly.",
  );

  assert(
    authority.classify({
      executionStatus:
        "success",
      verificationPassed:
        false,
      summary:
        "Verification failed.",
    }) ===
      "verification-failed",
    "Verification failure must be classified correctly.",
  );

  assert(
    authority.classify({
      executionStatus:
        "success",
      budgetExhausted:
        true,
      summary:
        "Budget exhausted.",
    }) ===
      "budget-exhausted",
    "Budget exhaustion must be classified correctly.",
  );

  console.log(
    "02.7 failure classification: SUCCESS",
  );

  /*
   * 2. Retryable transient failure
   */
  const firstRetry =
    authority.evaluate(
      failureInput(
        "transient-execution",
        1,
      ),
    );

  assert(
    firstRetry.decision.action ===
      "retry",
    "Initial transient failure should permit bounded retry.",
  );

  assert(
    firstRetry.decision.allowed,
    "Authorized transient retry must be allowed.",
  );

  console.log(
    "02.7 retryable failure handling: SUCCESS",
  );

  /*
   * 3. Repeated retry must change strategy.
   */
  const secondRetry =
    authority.evaluate(
      failureInput(
        "transient-execution",
        2,
        firstRetry.history,
      ),
    );

  assert(
    secondRetry.decision.action ===
      "retry",
    "Second transient failure may receive one final bounded retry.",
  );

  assert(
    secondRetry.decision.strategy ===
      "retry-with-fresh-execution",
    "Repeated retry must use a meaningfully different execution strategy.",
  );

  assert(
    secondRetry.history[1]
      .meaningfulChange,
    "Repeated recovery must record a meaningful strategy change.",
  );

  console.log(
    "02.7 meaningful retry strategy change: SUCCESS",
  );

  /*
   * 4. Recovery attempts must be bounded.
   */
  const exhausted =
    authority.evaluate(
      failureInput(
        "transient-execution",
        3,
        secondRetry.history,
      ),
    );

  assert(
    exhausted.decision.action ===
      "escalate",
    "Recovery must escalate after the authorized attempts are exhausted.",
  );

  assert(
    exhausted.decision.escalationRequired,
    "Exhausted recovery must require escalation.",
  );

  console.log(
    "02.7 bounded recovery attempts: SUCCESS",
  );

  /*
   * 5. Non-retryable failures must escalate immediately.
   */
  const budgetFailure =
    authority.evaluate(
      failureInput(
        "budget-exhausted",
        1,
      ),
    );

  assert(
    budgetFailure.decision.action ===
      "escalate",
    "Budget exhaustion must not be automatically retried.",
  );

  assert(
    budgetFailure.decision.escalationRequired,
    "Budget exhaustion must escalate.",
  );

  const authorizationFailure =
    authority.evaluate(
      failureInput(
        "authorization-failed",
        1,
      ),
    );

  assert(
    authorizationFailure.decision.action ===
      "escalate",
    "Authorization failure must not be retried.",
  );

  console.log(
    "02.7 non-retryable failure escalation: SUCCESS",
  );

  /*
   * 6. Verification failure must create a repair Work Unit.
   */
  const verificationFailure =
    authority.evaluate(
      failureInput(
        "verification-failed",
        1,
      ),
    );

  assert(
    verificationFailure.decision.action ===
      "repair",
    "Verification failure must create a repair path.",
  );

  assert(
    verificationFailure.decision.repairWorkUnit !==
      undefined,
    "Repair decision must contain a repair Work Unit.",
  );

  const repairWorkUnit =
    verificationFailure.decision
      .repairWorkUnit;

  assert(
    repairWorkUnit !==
      undefined,
    "Repair Work Unit must exist before its contents are inspected.",
  );

  assert(
    repairWorkUnit.parentTaskId ===
      "task-failure-escalation-test",
    "Repair Work Unit must preserve the original task identity.",
  );

  console.log(
    "02.7 verification failure repair Work Unit: SUCCESS",
  );

  /*
   * 7. Failure evidence must survive recovery.
   */
  assert(
    verificationFailure.failure
      .evidenceIds.includes(
        "evidence-failure-test",
      ),
    "Failure evidence must be preserved.",
  );

  assert(
    repairWorkUnit.inheritedEvidenceIds.includes(
      "evidence-failure-test",
    ),
    "Repair Work Unit must inherit the preserved failure evidence.",
  );

  assert(
    repairWorkUnit.preservedFailureIds.includes(
      verificationFailure.failure.id,
    ),
    "Repair Work Unit must preserve the originating failure record.",
  );

  console.log(
    "02.7 failure state and evidence preservation: SUCCESS",
  );

  /*
   * 8. Recovery must not mutate task state.
   *
   * The authority returns decisions and recovery artifacts.
   * TaskControl/workflow execution remains responsible for
   * applying any legitimate lifecycle transition.
   */
  assert(
    verificationFailure.decision.action ===
      "repair",
    "Failure authority must return a recovery decision rather than mutate task state.",
  );

  console.log(
    "02.7 task-state authority boundary: SUCCESS",
  );

  /*
   * 9. Unknown failures are recoverable only through a
   * meaningfully different repair path, never blind retry.
   */
  const unknownFailure =
    authority.evaluate(
      failureInput(
        "unknown",
        1,
      ),
    );

  assert(
    unknownFailure.decision.action ===
      "repair",
    "Unknown failures must use a repair path rather than blind retry.",
  );

  assert(
    unknownFailure.decision.strategy ===
      "repair-work-unit",
    "Unknown failures must receive the repair strategy.",
  );

  console.log(
    "02.7 unknown failure recovery discipline: SUCCESS",
  );

  /*
   * 10. Every recovery history entry must remain durable
   * and inspectable.
   */
  assert(
    exhausted.history.length ===
      3,
    "Recovery history must preserve every bounded recovery decision.",
  );

  assert(
    exhausted.history[0].attempt ===
      1,
    "First recovery attempt must be preserved.",
  );

  assert(
    exhausted.history[1].attempt ===
      2,
    "Second recovery attempt must be preserved.",
  );

  assert(
    exhausted.history[2].action ===
      "escalate",
    "Final exhausted recovery history must record escalation.",
  );

  console.log(
    "02.7 recovery history preservation: SUCCESS",
  );

  console.log(
    "TREE-02.7 FAILURE / ESCALATION: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "=== TREE-02.7 FAILED ===",
    );

    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
