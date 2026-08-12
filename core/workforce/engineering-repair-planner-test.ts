import {
  EngineeringRepairPlannerAuthority,
} from "./engineering-repair-planner";

import type {
  EngineeringFailureAnalysis,
} from "./engineering-failure-recovery";

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

function analysis(
  overrides:
    Partial<EngineeringFailureAnalysis> = {},
):
  EngineeringFailureAnalysis {
  return {
    id:
      "analysis-tree-0815",
    commandResultId:
      "result-tree-0815",
    projectId:
      "project-tree-0815",
    action:
      "retry",
    retryable:
      true,
    reason:
      "Compilation failed.",
    diagnostics: [
      "TypeScript compilation failed.",
    ],
    ...overrides,
  };
}

function main(): void {
  const planner =
    new EngineeringRepairPlannerAuthority();

  const retry =
    planner.plan(
      analysis(),
    );

  assert(
    retry.authorized,
    "Retry plans must be authorized when recovery policy permits retry.",
  );

  assert(
    retry.steps[0].strategy ===
      "inspect",
    "Retry planning must inspect diagnostics before retesting.",
  );

  assert(
    retry.steps[1].strategy ===
      "retest",
    "Retry planning must terminate in governed retesting.",
  );

  console.log(
    "08.15 retry repair planning: SUCCESS",
  );

  const repair =
    planner.plan(
      analysis({
        id:
          "analysis-tree-0815-repair",
        action:
          "repair",
        retryable:
          false,
      }),
    );

  assert(
    repair.authorized,
    "Authorized repair failures must produce an executable repair plan.",
  );

  assert(
    repair.steps.map(
      (step) =>
        step.strategy,
    ).join(",") ===
      "inspect,edit,retest",
    "Repair plan must inspect, edit, and retest in order.",
  );

  assert(
    repair.stopAfterFailure,
    "Repair plans must stop rather than continue blindly after a failed step.",
  );

  console.log(
    "08.15 governed repair sequence: SUCCESS",
  );

  const blocked =
    planner.plan(
      analysis({
        id:
          "analysis-tree-0815-blocked",
        action:
          "blocked",
        retryable:
          false,
        reason:
          "Authorization boundary denied execution.",
      }),
    );

  assert(
    !blocked.authorized,
    "Blocked engineering failures must never create an authorized repair plan.",
  );

  assert(
    blocked.steps[0].strategy ===
      "escalate",
    "Blocked failures must escalate for explicit authorization.",
  );

  console.log(
    "08.15 blocked-repair authorization protection: SUCCESS",
  );

  const complete =
    planner.plan(
      analysis({
        id:
          "analysis-tree-0815-complete",
        action:
          "complete",
        retryable:
          false,
      }),
    );

  assert(
    !complete.authorized &&
      complete.steps.length ===
        0,
    "Completed engineering work must not generate a repair plan.",
  );

  console.log(
    "08.15 completed-work repair suppression: SUCCESS",
  );

  console.log(
    "TREE-08.15 AUTONOMOUS REPAIR PLANNER: SUCCESS",
  );
}

main();
