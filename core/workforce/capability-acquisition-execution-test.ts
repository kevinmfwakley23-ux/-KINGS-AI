import {
  CapabilityAcquisitionExecutionAuthority,
} from "./capability-acquisition-execution";

import type {
  CapabilityAcquisitionPlan,
} from "./capability-acquisition";

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

function expectFailure(
  action:
    () => void,
  message:
    string,
): void {
  let failed =
    false;

  try {
    action();
  } catch {
    failed =
      true;
  }

  assert(
    failed,
    message,
  );
}

function main(): void {
  const authority =
    new CapabilityAcquisitionExecutionAuthority();

  const plan:
    CapabilityAcquisitionPlan =
    {
      id:
        "acquisition-plan-tree-0825",
      projectId:
        "project-tree-0825",
      budgetLimit:
        0,
      withinBudget:
        true,
      ready:
        false,
      actions: [
        {
          id:
            "acquisition-action-tree-0825",
          gapId:
            "gap-tree-0825",
          projectId:
            "project-tree-0825",
          strategy:
            "build-capability",
          language:
            "python",
          estimatedCost:
            0,
          requiresExternalProvider:
            false,
          approved:
            true,
          completed:
            false,
        },
      ],
    };

  const execution =
    authority.start(
      plan,
      "acquisition-action-tree-0825",
      "2026-08-12T14:00:00Z",
    );

  assert(
    execution.status ===
      "running",
    "Approved acquisition actions must enter running state.",
  );

  console.log(
    "08.25 approved acquisition execution: SUCCESS",
  );

  expectFailure(
    () =>
      authority.succeed(
        execution,
        "",
        "2026-08-12T14:01:00Z",
      ),
    "Acquisition success must require evidence.",
  );

  console.log(
    "08.25 acquisition evidence enforcement: SUCCESS",
  );

  const failed =
    authority.fail(
      execution,
      "Toolchain installation failed.",
      "2026-08-12T14:01:00Z",
    );

  assert(
    failed.status ===
      "failed",
    "Failed acquisition must persist failure state.",
  );

  expectFailure(
    () =>
      authority.completeAction(
        plan,
        failed,
      ),
    "Failed acquisition must not complete the capability action.",
  );

  console.log(
    "08.25 failed acquisition containment: SUCCESS",
  );

  const secondExecution =
    authority.start(
      plan,
      "acquisition-action-tree-0825",
      "2026-08-12T14:02:00Z",
    );

  const succeeded =
    authority.succeed(
      secondExecution,
      "Python runtime verified by executable probe and test execution.",
      "2026-08-12T14:03:00Z",
    );

  assert(
    succeeded.status ===
      "succeeded",
    "Successful acquisition must persist success state.",
  );

  console.log(
    "08.25 successful acquisition verification: SUCCESS",
  );

  const completed =
    authority.completeAction(
      plan,
      succeeded,
    );

  assert(
    completed.actions[0].completed,
    "Successful acquisition must complete the capability action.",
  );

  assert(
    completed.ready,
    "A plan with all acquisition actions completed must become ready.",
  );

  console.log(
    "08.25 acquisition completion authority: SUCCESS",
  );

  expectFailure(
    () =>
      authority.start(
        completed,
        "acquisition-action-tree-0825",
        "2026-08-12T14:04:00Z",
      ),
    "Completed acquisition actions must not execute again.",
  );

  console.log(
    "08.25 duplicate acquisition execution protection: SUCCESS",
  );

  console.log(
    "TREE-08.25 CAPABILITY ACQUISITION EXECUTION: SUCCESS",
  );
}

main();
