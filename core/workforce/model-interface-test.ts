import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  IntelligenceModel,
} from "./model-interface";

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

async function runTest(): Promise<void> {
const model: IntelligenceModel = {
  identity: {
    providerId:
      "provider-internal",
    modelId:
      "model-internal-code",
    displayName:
      "K.I.N.G.S. Internal Coding Model",
    providerKind:
      "internal-local",
    capabilities: [
      "reasoning",
      "planning",
      "coding",
      "debugging",
      "source-inspection",
      "structured-output",
      "tool-use",
      "recovery",
    ],
    inputModalities: [
      "text",
    ],
    outputModalities: [
      "text",
    ],
    contextWindowTokens:
      32_000,
    supportsToolCalling:
      true,
    supportsStructuredOutput:
      true,
    available:
      true,
  },

  canHandle(
    request: ModelExecutionRequest,
  ): boolean {
    return request.requiredCapabilities.every(
      (capability) =>
        this.identity.capabilities.includes(
          capability,
        ),
    );
  },

  async execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    if (
      !this.canHandle(request)
    ) {
      return {
        success: false,
        failure: {
          requestId:
            request.id,
          providerId:
            this.identity.providerId,
          modelId:
            this.identity.modelId,
          retryable: false,
          code:
            "CAPABILITY_MISMATCH",
          message:
            "Model cannot satisfy required capabilities.",
          metadata: {
            requestId:
              request.id,
            startedAt:
              "2026-08-12T00:00:00.000Z",
            completedAt:
              "2026-08-12T00:00:00.001Z",
            latencyMs: 1,
          },
        },
      };
    }

    return {
      success: true,
      response: {
        requestId:
          request.id,
        model:
          this.identity,
        content:
          "Test model response.",
        toolCallProposals:
          request.allowToolProposals
            ? [
                {
                  id:
                    "proposal-001",
                  toolId:
                    "tool-test",
                  arguments: {
                    value:
                      "test",
                  },
                },
              ]
            : [],
        usage: {
          elapsedMs: 1,
          tokensUsed: 10,
          iterationsUsed: 1,
          estimatedCost: 0,
          inputTokens: 7,
          outputTokens: 3,
        },
        metadata: {
          requestId:
            request.id,
          startedAt:
            "2026-08-12T00:00:00.000Z",
          completedAt:
            "2026-08-12T00:00:00.001Z",
          latencyMs: 1,
        },
      },
    };
  },
};

const request: ModelExecutionRequest = {
  id:
    "model-request-001",
  taskId:
    "task-model-interface",
  missionId:
    "mission-model-interface",
  messages: [
    {
      role:
        "user",
      content:
        "Inspect and improve this code.",
    },
  ],
  requiredCapabilities: [
    "coding",
    "debugging",
  ],
  inputModalities: [
    "text",
  ],
  outputModality:
    "text",
  allowToolProposals:
    true,
};

assert(
  model.identity.providerKind ===
    "internal-local",
  "Internal intelligence must be a first-class provider kind.",
);

console.log(
  "04.1 internal intelligence provider identity: SUCCESS",
);

assert(
  model.canHandle(
    request,
  ),
  "Capability-aware model selection failed.",
);

console.log(
  "04.1 capability-aware model interface: SUCCESS",
);

const result =
  await model.execute(
    request,
  );

assert(
  result.success,
  "Model execution contract failed.",
);

assert(
  result.response?.model.modelId ===
    "model-internal-code",
  "Model identity was not preserved.",
);

console.log(
  "04.1 provider-neutral execution result: SUCCESS",
);

assert(
  result.response?.usage.inputTokens ===
    7,
  "Input token usage was not preserved.",
);

assert(
  result.response?.usage.outputTokens ===
    3,
  "Output token usage was not preserved.",
);

console.log(
  "04.1 model usage accounting: SUCCESS",
);

assert(
  result.response?.toolCallProposals.length ===
    1,
  "Tool proposal was not preserved.",
);

assert(
  result.response?.toolCallProposals[0].toolId ===
    "tool-test",
  "Tool proposal identity was not preserved.",
);

console.log(
  "04.1 tool proposal boundary: SUCCESS",
);

const noToolRequest:
  ModelExecutionRequest = {
    ...request,
    id:
      "model-request-002",
    allowToolProposals:
      false,
  };

const noToolResult =
  await model.execute(
    noToolRequest,
  );

assert(
  noToolResult.response
    ?.toolCallProposals
    .length === 0,
  "Tool proposals must be suppressible by request policy.",
);

console.log(
  "04.1 tool proposal policy boundary: SUCCESS",
);

const unsupportedRequest:
  ModelExecutionRequest = {
    ...request,
    id:
      "model-request-003",
    requiredCapabilities: [
      "vision",
    ],
  };

const unsupportedResult =
  await model.execute(
    unsupportedRequest,
  );

assert(
  !unsupportedResult.success,
  "Capability mismatch must reject execution.",
);

assert(
  unsupportedResult.failure
    ?.code ===
    "CAPABILITY_MISMATCH",
  "Capability mismatch failure code was not preserved.",
);

console.log(
  "04.1 capability mismatch rejection: SUCCESS",
);

assert(
  model.identity.providerKind !==
    "external-paid",
  "Internal model was incorrectly classified as paid external intelligence.",
);

assert(
  model.identity.providerKind ===
    "internal-local" ||
  model.identity.providerKind ===
    "internal-self-hosted",
  "Internal intelligence was not represented as a first-class provider category.",
);

console.log(
  "04.1 internal/external provider separation: SUCCESS",
);

console.log(
  "TREE-04.1 MODEL INTERFACE: SUCCESS",
);
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
