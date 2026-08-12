import {
  EngineeringRepairExecutionAuthority,
} from "./engineering-repair-execution";

import type {
  EngineeringRepairPlan,
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

function repairPlan(
  overrides:
    Partial<EngineeringRepairPlan> = {},
):
  EngineeringRepairPlan {
  return {
    id:
      "repair-plan-tree-0816",
    projectId:
      "project-tree-0816",
    failureAnalysisId:
      "analysis-tree-0816",
    authorized:
      true,
    steps: [
      {
        id:
          "repair-step-inspect",
        strategy:
          "inspect",
        description:
          "Inspect failure.",
        reason:
          "Verified diagnostic evidence.",
        required:
          true,
      },
      {
        id:
          "repair-step-edit",
        strategy:
          "edit",
        description:
          "Apply minimal repair.",
        reason:
          "Repair authorized.",
        required:
          true,
      },
      {
        id:
          "repair-step-retest",
        strategy:
          "retest",
        description:
          "Verify repair.",
        reason:
          "Repair requires verification.",
        required:
          true,
      },
    ],
    stopAfterFailure:
      true,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const authority =
    new EngineeringRepairExecutionAuthority();

  const completed =
    await authority.execute(
      repairPlan(),
      {
        async execute(step) {
          return {
            success:
              true,
            output:
              `${step.strategy} completed.`,
          };
        },
      },
      new Date().toISOString(),
    );

  assert(
    completed.status ===
      "completed",
    "A fully successful repair sequence must complete.",
  );

  assert(
    completed.stepResults.length ===
      3,
    "Every repair step must produce a durable result.",
  );

  assert(
    completed.verified,
    "A successful repair must include a successful retest.",
  );

  console.log(
    "08.16 governed repair execution: SUCCESS",
  );

  const failed =
    await authority.execute(
      repairPlan({
        id:
          "repair-plan-tree-0816-failed",
      }),
      {
        async execute(step) {
          return {
            success:
              step.strategy !==
              "edit",
            output:
              `${step.strategy} failed.`,
          };
        },
      },
      new Date().toISOString(),
    );

  assert(
    failed.status ===
      "failed",
    "A failed repair step must fail the repair execution.",
  );

  assert(
    failed.stepResults.length ===
      2,
    "Repair execution must stop immediately after a failed step.",
  );

  assert(
    !failed.verified,
    "A failed repair must never be marked verified.",
  );

  console.log(
    "08.16 failed-repair containment: SUCCESS",
  );

  const blocked =
    await authority.execute(
      repairPlan({
        id:
          "repair-plan-tree-0816-blocked",
        authorized:
          false,
      }),
      {
        async execute() {
          throw new Error(
            "Blocked repair plans must never execute.",
          );
        },
      },
      new Date().toISOString(),
    );

  assert(
    blocked.status ===
      "blocked",
    "Unauthorized repair plans must remain blocked.",
  );

  assert(
    blocked.stepResults.length ===
      0,
    "Blocked repair plans must execute zero repair steps.",
  );

  console.log(
    "08.16 repair authorization boundary: SUCCESS",
  );

  console.log(
    "TREE-08.16 REPAIR EXECUTION AUTHORITY: SUCCESS",
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
