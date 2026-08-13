import type {
  EngineeringCommandResult,
} from "./engineering-execution-loop";

import {
  EngineeringFailureRecoveryAuthority,
} from "./engineering-failure-recovery";

import {
  EngineeringRepairPlannerAuthority,
} from "./engineering-repair-planner";

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

function failureResult():
  EngineeringCommandResult {
  return {
    id:
      "result-real-local-failure",
    commandId:
      "command-real-local-failure",
    projectId:
      "project-real-local-recovery",
    status:
      "failed",
    exitCode:
      1,
    stdout:
      "",
    stderr:
      "TS2322: Type 'string' is not assignable to type 'number'.",
    durationMs:
      11,
    completedAt:
      "2026-08-13T00:00:00.011Z",
  };
}

async function main(): Promise<void> {
  const authority =
    new EngineeringFailureRecoveryAuthority();

  const failure =
    failureResult();

  const retryAnalysis =
    authority.analyze(
      failure,
      1,
      {
        maxRetries:
          2,
        allowRepair:
          true,
      },
    );

  assert(
    retryAnalysis.action ===
      "retry",
    "First failure within retry budget must enter retry recovery.",
  );

  assert(
    retryAnalysis.retryable,
    "Retry recovery must be marked retryable.",
  );

  assert(
    retryAnalysis.diagnostics.some(
      (
        diagnostic,
      ) =>
        diagnostic.includes(
          "TS2322",
        ),
    ),
    "Failure diagnostics must be preserved.",
  );

  console.log(
    "08.RECOVERY first-failure retry decision: SUCCESS",
  );

  const repairAnalysis =
    authority.analyze(
      failure,
      2,
      {
        maxRetries:
          2,
        allowRepair:
          true,
      },
    );

  assert(
    repairAnalysis.action ===
      "repair",
    "Retry exhaustion with repair permission must enter repair recovery.",
  );

  assert(
    !repairAnalysis.retryable,
    "Repair recovery must not remain marked retryable.",
  );

  assert(
    repairAnalysis.projectId ===
      "project-real-local-recovery",
    "Recovery must preserve project identity.",
  );

  console.log(
    "08.RECOVERY repair transition: SUCCESS",
  );

  const blocked =
    authority.analyze(
      {
        ...failure,
        id:
          "result-blocked",
        status:
          "blocked",
        stderr:
          "Engineering workspace authorization denied.",
      },
      1,
      {
        maxRetries:
          2,
        allowRepair:
          true,
      },
    );

  assert(
    blocked.action ===
      "blocked",
    "Blocked execution must remain blocked.",
  );

  assert(
    blocked.retryable ===
      false,
    "Authorization blocks must never be treated as retryable failures.",
  );

  console.log(
    "08.RECOVERY authorization-boundary protection: SUCCESS",
  );

  const planner =
    new EngineeringRepairPlannerAuthority();

  const repairPlan =
    planner.plan(
      repairAnalysis,
    );

  assert(
    repairPlan.authorized,
    "Authorized repair analysis must produce an authorized repair plan.",
  );

  assert(
    repairPlan.steps.some(
      (
        step,
      ) =>
        step.strategy ===
        "edit",
    ),
    "Repair plan must contain the existing governed edit strategy.",
  );

  assert(
    repairPlan.steps.some(
      (
        step,
      ) =>
        step.strategy ===
        "retest",
    ),
    "Repair plan must require retesting after repair.",
  );

  console.log(
    "08.RECOVERY repair-plan generation: SUCCESS",
  );

  console.log(
    "TREE-08 REAL FAILURE → RECOVERY → REPAIR PLAN: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
