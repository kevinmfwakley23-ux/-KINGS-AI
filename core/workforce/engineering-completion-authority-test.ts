import {
  EngineeringCompletionAuthority,
} from "./engineering-completion-authority";

import type {
  EngineeringVerificationGateResult,
} from "./engineering-verification-gate";

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

function main(): void {
  const authority =
    new EngineeringCompletionAuthority();

  const accepted:
    EngineeringVerificationGateResult =
    {
      id:
        "verification-tree-0818",
      projectId:
        "project-tree-0818",
      accepted:
        true,
      evidence: [
        {
          id:
            "evidence-compile",
          projectId:
            "project-tree-0818",
          source:
            "command",
          referenceId:
            "result-compile",
          criterion:
            "Project compiles successfully.",
          passed:
            true,
          summary:
            "Compilation succeeded.",
        },
        {
          id:
            "evidence-test",
          projectId:
            "project-tree-0818",
          source:
            "command",
          referenceId:
            "result-test",
          criterion:
            "Project tests pass.",
          passed:
            true,
          summary:
            "Tests succeeded.",
        },
      ],
      unmetCriteria: [],
    };

  const completed =
    authority.complete({
      projectId:
        "project-tree-0818",
      taskId:
        "task-tree-0818",
      verification:
        accepted,
      requiredCriteria: [
        "Project compiles successfully.",
        "Project tests pass.",
      ],
    });

  assert(
    completed.completed,
    "Fully verified engineering work must be completable.",
  );

  assert(
    completed.unmetCriteria.length ===
      0,
    "Completed engineering work must have no unmet criteria.",
  );

  console.log(
    "08.18 verified engineering completion: SUCCESS",
  );

  const incomplete:
    EngineeringVerificationGateResult =
    {
      id:
        "verification-tree-0818-incomplete",
      projectId:
        "project-tree-0818-incomplete",
      accepted:
        false,
      evidence: [
        {
          id:
            "evidence-compile-incomplete",
          projectId:
            "project-tree-0818-incomplete",
          source:
            "command",
          referenceId:
            "result-compile-incomplete",
          criterion:
            "Project compiles successfully.",
          passed:
            true,
          summary:
            "Compilation succeeded.",
        },
        {
          id:
            "evidence-test-incomplete",
          projectId:
            "project-tree-0818-incomplete",
          source:
            "command",
          referenceId:
            "result-test-incomplete",
          criterion:
            "Project tests pass.",
          passed:
            false,
          summary:
            "Tests failed.",
        },
      ],
      unmetCriteria: [
        "Project tests pass.",
      ],
    };

  const rejected =
    authority.complete({
      projectId:
        "project-tree-0818-incomplete",
      taskId:
        "task-tree-0818-incomplete",
      verification:
        incomplete,
      requiredCriteria: [
        "Project compiles successfully.",
        "Project tests pass.",
      ],
    });

  assert(
    !rejected.completed,
    "Incomplete verification must prevent engineering completion.",
  );

  assert(
    rejected.unmetCriteria.includes(
      "Project tests pass.",
    ),
    "Completion rejection must identify the unmet criterion.",
  );

  console.log(
    "08.18 incomplete-work rejection: SUCCESS",
  );

  const missing:
    EngineeringVerificationGateResult =
    {
      id:
        "verification-tree-0818-missing",
      projectId:
        "project-tree-0818-missing",
      accepted:
        false,
      evidence: [],
      unmetCriteria: [
        "Project compiles successfully.",
      ],
    };

  const missingResult =
    authority.complete({
      projectId:
        "project-tree-0818-missing",
      taskId:
        "task-tree-0818-missing",
      verification:
        missing,
      requiredCriteria: [
        "Project compiles successfully.",
      ],
    });

  assert(
    !missingResult.completed,
    "Missing verification evidence must prevent completion.",
  );

  console.log(
    "08.18 missing-evidence completion protection: SUCCESS",
  );

  console.log(
    "TREE-08.18 ENGINEERING COMPLETION AUTHORITY: SUCCESS",
  );
}

main();
