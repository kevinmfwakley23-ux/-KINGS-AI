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
    throw new Error(message);
  }
}

const authority =
  new BudgetAuthority();

const budget: WorkUnitBudget = {
  maxTimeMs: 1000,
  maxTokens: 100,
  maxIterations: 5,
};

const valid =
  authority.evaluate(
    budget,
    {
      elapsedMs: 500,
      tokensUsed: 50,
      iterationsUsed: 2,
    },
  );

assert(
  valid.allowed,
  "Valid budget usage should be allowed.",
);

const timeExceeded =
  authority.evaluate(
    budget,
    {
      elapsedMs: 1001,
      tokensUsed: 50,
      iterationsUsed: 2,
    },
  );

assert(
  !timeExceeded.allowed,
  "Time budget overrun should be rejected.",
);

const tokensExceeded =
  authority.evaluate(
    budget,
    {
      elapsedMs: 500,
      tokensUsed: 101,
      iterationsUsed: 2,
    },
  );

assert(
  !tokensExceeded.allowed,
  "Token budget overrun should be rejected.",
);

const iterationsExceeded =
  authority.evaluate(
    budget,
    {
      elapsedMs: 500,
      tokensUsed: 50,
      iterationsUsed: 6,
    },
  );

assert(
  !iterationsExceeded.allowed,
  "Iteration budget overrun should be rejected.",
);

const invalid =
  authority.validateBudget({
    maxTimeMs: 0,
    maxTokens: -1,
    maxIterations: 0,
  });

assert(
  !invalid.allowed,
  "Invalid budget must be rejected.",
);

let assertAllowedRejected = false;

try {
  authority.assertAllowed(
    budget,
    {
      elapsedMs: 1001,
      tokensUsed: 50,
      iterationsUsed: 2,
    },
  );
} catch {
  assertAllowedRejected = true;
}

assert(
  assertAllowedRejected,
  "assertAllowed must reject an exceeded budget.",
);

console.log(
  "01.6 budget validation: SUCCESS",
);

console.log(
  "01.6 time enforcement: SUCCESS",
);

console.log(
  "01.6 token enforcement: SUCCESS",
);

console.log(
  "01.6 iteration enforcement: SUCCESS",
);

console.log(
  "01.6 invalid budget rejection: SUCCESS",
);

console.log(
  "01.6 assertAllowed enforcement: SUCCESS",
);
