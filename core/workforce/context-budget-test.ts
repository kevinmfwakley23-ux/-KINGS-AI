import {
  ContextBudgetAuthority,
} from "./context-budget";

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

const authority =
  new ContextBudgetAuthority();

const budget =
  {
    maxTokens: 50_000,
  };

const withinBudget =
  authority.evaluate({
    budget,
    segments: [
      {
        id:
          "high-value",
        estimatedTokens:
          20_000,
        priority:
          "high",
        optimizable:
          false,
      },
      {
        id:
          "medium-value",
        estimatedTokens:
          18_000,
        priority:
          "medium",
        optimizable:
          true,
      },
      {
        id:
          "low-value",
        estimatedTokens:
          10_000,
        priority:
          "low",
        optimizable:
          true,
      },
    ],
  });

assert(
  withinBudget.allowed,
  "Context within budget must be allowed.",
);

assert(
  !withinBudget.optimizationRequired,
  "Context within budget must not require optimization.",
);

console.log(
  "03.8 context within budget: SUCCESS",
);

const overBudget =
  authority.evaluate({
    budget,
    segments: [
      {
        id:
          "high-value",
        estimatedTokens:
          20_000,
        priority:
          "high",
        optimizable:
          false,
      },
      {
        id:
          "medium-value",
        estimatedTokens:
          18_000,
        priority:
          "medium",
        optimizable:
          true,
      },
      {
        id:
          "low-value",
        estimatedTokens:
          24_000,
        priority:
          "low",
        optimizable:
          true,
      },
    ],
  });

assert(
  !overBudget.allowed,
  "Context over budget must require optimization.",
);

assert(
  overBudget.optimizationRequired,
  "Budget pressure must be detected.",
);

assert(
  overBudget.tokensToRemove ===
    12_000,
  "Context overage calculation is incorrect.",
);

assert(
  overBudget.targetTokens ===
    50_000,
  "Context target budget is incorrect.",
);

console.log(
  "03.8 context overage detection: SUCCESS",
);

const plan =
  authority.plan({
    budget,
    segments: [
      {
        id:
          "high-value",
        estimatedTokens:
          20_000,
        priority:
          "high",
        optimizable:
          false,
      },
      {
        id:
          "medium-value",
        estimatedTokens:
          18_000,
        priority:
          "medium",
        optimizable:
          true,
      },
      {
        id:
          "low-value",
        estimatedTokens:
          24_000,
        priority:
          "low",
        optimizable:
          true,
      },
    ],
  });

assert(
  plan.candidates.length >
    0,
  "Over-budget context must produce reduction candidates.",
);

assert(
  plan.candidates[0].id ===
    "low-value",
  "Low-value context must be reduced before medium-value context.",
);

assert(
  !plan.candidates.some(
    (candidate) =>
      candidate.id ===
      "high-value",
  ),
  "High-value non-optimizable context must be preserved.",
);

console.log(
  "03.8 low-value-first reduction planning: SUCCESS",
);

assert(
  plan.plannedReductionTokens ===
    12_000,
  "Reduction plan must remove exactly the required overage.",
);

assert(
  plan.projectedTokens ===
    50_000,
  "Projected context must reach the budget.",
);

assert(
  plan.targetReached,
  "Context budget target must be reached.",
);

console.log(
  "03.8 target budget calculation: SUCCESS",
);

const partialPlan =
  authority.plan({
    budget: {
      maxTokens:
        50_000,
    },
    segments: [
      {
        id:
          "high-value",
        estimatedTokens:
          20_000,
        priority:
          "high",
        optimizable:
          false,
      },
      {
        id:
          "medium-value",
        estimatedTokens:
          35_000,
        priority:
          "medium",
        optimizable:
          false,
      },
      {
        id:
          "low-value",
        estimatedTokens:
          5_000,
        priority:
          "low",
        optimizable:
          true,
      },
    ],
  });

assert(
  partialPlan.candidates.length ===
    1,
  "Only optimizable context should become a reduction candidate.",
);

assert(
  partialPlan.candidates[0].id ===
    "low-value",
  "Low-value optimizable context must be selected.",
);

assert(
  partialPlan.candidates[0].removableTokens ===
    5_000,
  "Reduction must be bounded by available removable tokens.",
);

assert(
  !partialPlan.targetReached,
  "Budget must remain unmet when insufficient removable context exists.",
);

console.log(
  "03.8 bounded reduction planning: SUCCESS",
);

const deterministicA =
  authority.plan({
    budget: {
      maxTokens:
        10_000,
    },
    segments: [
      {
        id:
          "zeta",
        estimatedTokens:
          4_000,
        priority:
          "low",
        optimizable:
          true,
      },
      {
        id:
          "alpha",
        estimatedTokens:
          4_000,
        priority:
          "low",
        optimizable:
          true,
      },
      {
        id:
          "beta",
        estimatedTokens:
          4_000,
        priority:
          "medium",
        optimizable:
          true,
      },
    ],
  });

const deterministicB =
  authority.plan({
    budget: {
      maxTokens:
        10_000,
    },
    segments: [
      {
        id:
          "beta",
        estimatedTokens:
          4_000,
        priority:
          "medium",
        optimizable:
          true,
      },
      {
        id:
          "alpha",
        estimatedTokens:
          4_000,
        priority:
          "low",
        optimizable:
          true,
      },
      {
        id:
          "zeta",
        estimatedTokens:
          4_000,
        priority:
          "low",
        optimizable:
          true,
      },
    ],
  });

assert(
  JSON.stringify(
    deterministicA.candidates,
  ) ===
    JSON.stringify(
      deterministicB.candidates,
    ),
  "Context budget planning must be deterministic.",
);

console.log(
  "03.8 deterministic budget planning: SUCCESS",
);

const estimated =
  authority.estimateTokens(
    "1234567890",
  );

assert(
  estimated === 3,
  "Token estimation heuristic is incorrect.",
);

assert(
  authority.estimateTokens(
    "",
  ) === 0,
  "Empty content must estimate to zero tokens.",
);

console.log(
  "03.8 local token estimation: SUCCESS",
);

let invalidBudgetRejected =
  false;

try {
  authority.validateBudget({
    maxTokens: 0,
  });
} catch {
  invalidBudgetRejected =
    true;
}

assert(
  invalidBudgetRejected,
  "Invalid context budget must be rejected.",
);

console.log(
  "03.8 invalid context budget rejection: SUCCESS",
);

let invalidSegmentRejected =
  false;

try {
  authority.evaluate({
    budget: {
      maxTokens:
        10_000,
    },
    segments: [
      {
        id:
          "invalid",
        estimatedTokens:
          -1,
        priority:
          "low",
        optimizable:
          true,
      },
    ],
  });
} catch {
  invalidSegmentRejected =
    true;
}

assert(
  invalidSegmentRejected,
  "Invalid context segment estimates must be rejected.",
);

console.log(
  "03.8 invalid context estimate rejection: SUCCESS",
);

console.log(
  "TREE-03.8 CONTEXT BUDGET: SUCCESS",
);
