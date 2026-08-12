import {
  CapabilityAcquisitionAuthority,
} from "./capability-acquisition";

import type {
  CapabilityGapResolutionPlan,
} from "./capability-gap-resolution";

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
    new CapabilityAcquisitionAuthority();

  const gaps:
    CapabilityGapResolutionPlan =
    {
      id:
        "gap-plan-tree-0824",
      projectId:
        "project-tree-0824",
      gaps: [
        {
          id:
            "gap-python",
          projectId:
            "project-tree-0824",
          kind:
            "language",
          language:
            "python",
          resolved:
            false,
          verified:
            false,
        },
        {
          id:
            "gap-run",
          projectId:
            "project-tree-0824",
          kind:
            "operation",
          operation:
            "run",
          resolved:
            false,
          verified:
            false,
        },
      ],
      ready:
        false,
    };

  const plan =
    authority.createPlan({
      plan:
        gaps,
      budgetLimit:
        0,
    });

  assert(
    plan.actions.length ===
      2,
    "Every capability gap must receive an acquisition action.",
  );

  assert(
    plan.actions.every(
      (action) =>
        action.estimatedCost ===
          0 &&
        !action.requiresExternalProvider,
    ),
    "Default capability acquisition must prefer zero-cost local capability paths.",
  );

  console.log(
    "08.24 budget-first acquisition planning: SUCCESS",
  );

  const firstAction =
    plan.actions[0];

  expectFailure(
    () =>
      authority.complete(
        plan,
        firstAction.id,
      ),
    "Acquisition must not complete before approval.",
  );

  console.log(
    "08.24 approval-before-completion protection: SUCCESS",
  );

  const approved =
    authority.approve(
      plan,
      firstAction.id,
    );

  assert(
    approved.actions.some(
      (action) =>
        action.id ===
          firstAction.id &&
        action.approved,
    ),
    "Approved acquisition actions must persist approval.",
  );

  console.log(
    "08.24 governed acquisition approval: SUCCESS",
  );

  const completed =
    authority.complete(
      approved,
      firstAction.id,
    );

  assert(
    completed.actions.some(
      (action) =>
        action.id ===
          firstAction.id &&
        action.completed,
    ),
    "Completed acquisition actions must persist completion.",
  );

  assert(
    !completed.ready,
    "Remaining acquisition actions must continue blocking readiness.",
  );

  console.log(
    "08.24 acquisition completion tracking: SUCCESS",
  );

  const finalApproved =
    authority.approve(
      completed,
      completed.actions[1].id,
    );

  const final =
    authority.complete(
      finalApproved,
      completed.actions[1].id,
    );

  assert(
    final.ready,
    "All completed capability acquisitions must permit acquisition-plan readiness.",
  );

  console.log(
    "08.24 complete capability acquisition: SUCCESS",
  );

  console.log(
    "TREE-08.24 CAPABILITY ACQUISITION AUTHORITY: SUCCESS",
  );
}

main();
