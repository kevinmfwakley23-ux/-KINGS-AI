import {
  EngineeringFailureRecoveryAuthority,
} from "./engineering-failure-recovery";

import type {
  EngineeringCommandResult,
} from "./engineering-execution-loop";

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

function failedResult(
  overrides:
    Partial<EngineeringCommandResult> = {},
):
  EngineeringCommandResult {
  return {
    id:
      "result-tree-0814",
    commandId:
      "command-tree-0814",
    projectId:
      "project-tree-0814",
    status:
      "failed",
    exitCode:
      1,
    stdout:
      "",
    stderr:
      "TypeScript compilation failed.",
    durationMs:
      150,
    completedAt:
      new Date().toISOString(),
    ...overrides,
  };
}

function main(): void {
  const authority =
    new EngineeringFailureRecoveryAuthority();

  const retry =
    authority.analyze(
      failedResult(),
      1,
      {
        maxRetries:
          3,
        allowRepair:
          true,
      },
    );

  assert(
    retry.action ===
      "retry",
    "Retryable engineering failures must produce a retry action.",
  );

  assert(
    retry.retryable,
    "Retryable failures must be explicitly marked retryable.",
  );

  assert(
    retry.diagnostics.includes(
      "TypeScript compilation failed.",
    ),
    "Failure diagnostics must be preserved.",
  );

  console.log(
    "08.14 retryable failure analysis: SUCCESS",
  );

  const repair =
    authority.analyze(
      failedResult({
        id:
          "result-tree-0814-repair",
      }),
      3,
      {
        maxRetries:
          3,
        allowRepair:
          true,
      },
    );

  assert(
    repair.action ===
      "repair",
    "Exhausted retries with repair enabled must enter repair state.",
  );

  console.log(
    "08.14 automated repair transition: SUCCESS",
  );

  const escalate =
    authority.analyze(
      failedResult({
        id:
          "result-tree-0814-escalate",
      }),
      3,
      {
        maxRetries:
          3,
        allowRepair:
          false,
      },
    );

  assert(
    escalate.action ===
      "escalate",
    "Exhausted automated recovery must escalate rather than loop forever.",
  );

  console.log(
    "08.14 recovery exhaustion escalation: SUCCESS",
  );

  const blocked =
    authority.analyze(
      failedResult({
        id:
          "result-tree-0814-blocked",
        status:
          "blocked",
        stderr:
          "Workspace authorization denied.",
      }),
      1,
      {
        maxRetries:
          3,
        allowRepair:
          true,
      },
    );

  assert(
    blocked.action ===
      "blocked",
    "Authorization failures must never be retried automatically.",
  );

  assert(
    !blocked.retryable,
    "Blocked commands must never be marked retryable.",
  );

  console.log(
    "08.14 authorization failure protection: SUCCESS",
  );

  const complete =
    authority.analyze(
      failedResult({
        id:
          "result-tree-0814-complete",
        status:
          "success",
        exitCode:
          0,
        stdout:
          "Build successful.",
        stderr:
          "",
      }),
      1,
      {
        maxRetries:
          3,
        allowRepair:
          true,
      },
    );

  assert(
    complete.action ===
      "complete",
    "Successful results must terminate recovery and mark completion.",
  );

  console.log(
    "08.14 successful-result completion: SUCCESS",
  );

  console.log(
    "TREE-08.14 ENGINEERING FAILURE RECOVERY: SUCCESS",
  );
}

main();
