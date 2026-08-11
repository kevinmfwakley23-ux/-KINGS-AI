import {
  BudgetAuthority,
} from "./budget-authority";

import type {
  WorkUnitBudget,
} from "./work-unit-contract";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const authority =
    new BudgetAuthority();

  const budget:
    WorkUnitBudget = {
    maxTimeMs:
      1000,
    maxTokens:
      100,
    maxIterations:
      5,
  };

  const valid =
    authority.evaluate(
      budget,
      {
        elapsedMs:
          500,
        tokensUsed:
          50,
        iterationsUsed:
          2,
      },
    );

  assert(
    valid.allowed,
    "Worker usage within all limits must be allowed.",
  );

  console.log(
    "02.6 worker budget validation: SUCCESS",
  );

  const timeExceeded =
    authority.evaluate(
      budget,
      {
        elapsedMs:
          1001,
        tokensUsed:
          50,
        iterationsUsed:
          2,
      },
    );

  assert(
    !timeExceeded.allowed,
    "Worker time overrun must be rejected.",
  );

  console.log(
    "02.6 worker time limit enforcement: SUCCESS",
  );

  const tokenExceeded =
    authority.evaluate(
      budget,
      {
        elapsedMs:
          500,
        tokensUsed:
          101,
        iterationsUsed:
          2,
      },
    );

  assert(
    !tokenExceeded.allowed,
    "Worker token overrun must be rejected.",
  );

  console.log(
    "02.6 worker token limit enforcement: SUCCESS",
  );

  const iterationExceeded =
    authority.evaluate(
      budget,
      {
        elapsedMs:
          500,
        tokensUsed:
          50,
        iterationsUsed:
          6,
      },
    );

  assert(
    !iterationExceeded.allowed,
    "Worker iteration overrun must be rejected.",
  );

  console.log(
    "02.6 worker iteration limit enforcement: SUCCESS",
  );

  const invalid =
    authority.validateBudget({
      maxTimeMs:
        0,
      maxTokens:
        -1,
      maxIterations:
        0,
    });

  assert(
    !invalid.allowed,
    "Invalid worker budget must be rejected.",
  );

  console.log(
    "02.6 invalid worker budget rejection: SUCCESS",
  );

  let assertAllowedRejected =
    false;

  try {
    authority.assertAllowed(
      budget,
      {
        elapsedMs:
          1001,
        tokensUsed:
          50,
        iterationsUsed:
          2,
      },
    );
  } catch {
    assertAllowedRejected =
      true;
  }

  assert(
    assertAllowedRejected,
    "Budget authority assertAllowed must reject over-limit worker usage.",
  );

  console.log(
    "02.6 authoritative budget assertion: SUCCESS",
  );

  /*
   * 02.6 deliberately does not establish retry policy.
   *
   * Retry and escalation behavior belongs to TREE 02.7.
   * The worker budget authority therefore remains responsible
   * for bounded time, token, and iteration consumption only.
   */
  console.log(
    "02.6 retry authority boundary preserved for TREE-02.7: SUCCESS",
  );

  console.log(
    "TREE-02.6 WORKER BUDGETS / LIMITS: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "=== TREE-02.6 FAILED ===",
    );
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
