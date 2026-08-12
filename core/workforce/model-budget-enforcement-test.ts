import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import {
  ModelBudgetEnforcer,
} from "./model-budget-enforcement";

function assert(
  condition:
    boolean,
  message:
    string,
):
  void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function usage(
  tokens:
    number,
  cost:
    number,
) {
  return {
    elapsedMs:
      10,
    tokensUsed:
      tokens,
    iterationsUsed:
      1,
    estimatedCost:
      cost,
    inputTokens:
      tokens,
    outputTokens:
      0,
  };
}

async function runTest(): Promise<void> {
const enforcer =
  new ModelBudgetEnforcer({
    maxTokens:
      100,
    maxInputTokens:
      80,
    maxOutputTokens:
      40,
    maxEstimatedCost:
      1.00,
    maxRequests:
      3,
  });

const scope =
  "mission-budget-test";

const first =
  enforcer.check(
    scope,
    usage(
      20,
      0.10,
    ),
  );

assert(
  first.allowed,
  "Initial usage should be allowed.",
);

console.log(
  "04.5 initial budget authorization: SUCCESS",
);

enforcer.record(
  scope,
  usage(
    20,
    0.10,
  ),
);

const recorded =
  enforcer.getUsage(
    scope,
  );

assert(
  recorded.requests ===
    1,
  "Request usage was not recorded.",
);

assert(
  recorded.tokens ===
    20,
  "Token usage was not recorded.",
);

assert(
  recorded.estimatedCost ===
    0.10,
  "Cost usage was not recorded.",
);

console.log(
  "04.5 usage accounting: SUCCESS",
);

const second =
  enforcer.check(
    scope,
    usage(
      30,
      0.20,
    ),
  );

assert(
  second.allowed,
  "Second request should remain within budget.",
);

console.log(
  "04.5 cumulative budget enforcement: SUCCESS",
);

enforcer.record(
  scope,
  usage(
    30,
    0.20,
  ),
);

const exhausted =
  enforcer.check(
    scope,
    usage(
      60,
      0.10,
    ),
  );

assert(
  !exhausted.allowed,
  "Token overage must be rejected.",
);

assert(
  exhausted.reason.includes(
    "token quota exceeded",
  ),
  "Token quota failure reason was not preserved.",
);

console.log(
  "04.5 token quota enforcement: SUCCESS",
);

const request:
  ModelExecutionRequest = {
  id:
    "budget-request-001",
  taskId:
    "budget-task",
  missionId:
    scope,
  messages: [
    {
      role:
        "user",
      content:
        "Test budget authorization.",
    },
  ],
  requiredCapabilities: [
    "coding",
  ],
  inputModalities: [
    "text",
  ],
  outputModality:
    "text",
  maxOutputTokens:
    20,
  allowToolProposals:
    false,
};

const tokenExhaustionEnforcer =
  new ModelBudgetEnforcer({
    maxTokens:
      100,
    maxInputTokens:
      80,
    maxOutputTokens:
      40,
    maxEstimatedCost:
      10.00,
    maxRequests:
      10,
  });

tokenExhaustionEnforcer.record(
  "scope-token-exhaustion",
  usage(
    100,
    0.30,
  ),
);

const requestDecision =
  tokenExhaustionEnforcer.authorizeRequest(
    "scope-token-exhaustion",
    request,
  );

assert(
  requestDecision.allowed ===
    false,
  "Already exhausted token budget must block new requests.",
);

assert(
  requestDecision.reason.includes(
    "token quota already exhausted",
  ),
  "Exhausted token quota reason was not preserved.",
);

console.log(
  "04.5 pre-execution quota enforcement: SUCCESS",
);

const requestLimited =
  new ModelBudgetEnforcer({
    maxTokens:
      100,
    maxInputTokens:
      80,
    maxOutputTokens:
      10,
    maxEstimatedCost:
      1.00,
    maxRequests:
      3,
  });

const outputTooLarge =
  requestLimited.authorizeRequest(
    "scope-output",
    {
      ...request,
      maxOutputTokens:
        20,
    },
  );

assert(
  !outputTooLarge.allowed,
  "Request exceeding output quota must be rejected.",
);

assert(
  outputTooLarge.reason.includes(
    "output token limit",
  ),
  "Output quota rejection reason was not preserved.",
);

console.log(
  "04.5 output quota enforcement: SUCCESS",
);

const costLimited =
  new ModelBudgetEnforcer({
    maxTokens:
      100,
    maxInputTokens:
      80,
    maxOutputTokens:
      40,
    maxEstimatedCost:
      0.25,
    maxRequests:
      3,
  });

costLimited.record(
  "scope-cost",
  usage(
    10,
    0.20,
  ),
);

const costDecision =
  costLimited.check(
    "scope-cost",
    usage(
      10,
      0.10,
    ),
  );

assert(
  !costDecision.allowed,
  "Cost overage must be rejected.",
);

assert(
  costDecision.reason.includes(
    "cost quota exceeded",
  ),
  "Cost quota failure reason was not preserved.",
);

console.log(
  "04.5 cost quota enforcement: SUCCESS",
);

const requestLimitedCount =
  new ModelBudgetEnforcer({
    maxTokens:
      1_000,
    maxInputTokens:
      800,
    maxOutputTokens:
      400,
    maxEstimatedCost:
      10,
    maxRequests:
      1,
  });

requestLimitedCount.record(
  "scope-request",
  usage(
    1,
    0,
  ),
);

const requestQuota =
  requestLimitedCount.authorizeRequest(
    "scope-request",
    request,
  );

assert(
  !requestQuota.allowed,
  "Request quota exhaustion must block execution.",
);

assert(
  requestQuota.reason.includes(
    "request quota",
  ),
  "Request quota failure reason was not preserved.",
);

console.log(
  "04.5 request quota enforcement: SUCCESS",
);

const executionEnforcer =
  new ModelBudgetEnforcer({
    maxTokens:
      100,
    maxInputTokens:
      80,
    maxOutputTokens:
      40,
    maxEstimatedCost:
      1.00,
    maxRequests:
      1,
  });

let executed =
  false;

const successfulResult:
  ModelExecutionResult = {
  success:
    true,
  response: {
    requestId:
      request.id,
    model: {
      providerId:
        "provider-test",
      modelId:
        "model-test",
      displayName:
        "Budget Test Model",
      providerKind:
        "internal-local",
      capabilities: [
        "coding",
      ],
      inputModalities: [
        "text",
      ],
      outputModalities: [
        "text",
      ],
      contextWindowTokens:
        16_000,
      supportsToolCalling:
        false,
      supportsStructuredOutput:
        true,
      available:
        true,
    },
    content:
      "Budget test response.",
    toolCallProposals: [],
    usage:
      usage(
        15,
        0.05,
      ),
    metadata: {
      requestId:
        request.id,
      startedAt:
        "2026-08-12T00:00:00.000Z",
      completedAt:
        "2026-08-12T00:00:00.010Z",
      latencyMs:
        10,
    },
  },
};

const execution =
  await executionEnforcer.executeWithinBudget(
    "scope-execution",
    request,
    async () => {
      executed =
        true;

      return successfulResult;
    },
  );

assert(
  execution.success,
  "Budget-authorized execution should succeed.",
);

assert(
  executed,
  "Authorized execution was not delegated.",
);

assert(
  executionEnforcer.getUsage(
    "scope-execution",
  ).tokens ===
    15,
  "Successful execution usage was not recorded.",
);

console.log(
  "04.5 budget-gated model execution: SUCCESS",
);

const blockedExecution =
  await executionEnforcer.executeWithinBudget(
    "scope-execution",
    request,
    async () => {
      throw new Error(
        "This execution must never run.",
      );
    },
  );

assert(
  !blockedExecution.success,
  "Exhausted budget must block model execution.",
);

assert(
  blockedExecution.failure?.code ===
    "BUDGET_EXCEEDED",
  "Budget execution failure code was not preserved.",
);

console.log(
  "04.5 blocked execution preservation: SUCCESS",
);

console.log(
  "TREE-04.5 BUDGET / QUOTA ENFORCEMENT: SUCCESS",
);
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
