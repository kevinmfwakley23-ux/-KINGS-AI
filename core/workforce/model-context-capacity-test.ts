import type { ModelExecutionRequest } from "./model-interface";
import { estimateModelContextCapacity } from "./model-context-capacity";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function request(
  content: string,
  options: Partial<ModelExecutionRequest> = {},
): ModelExecutionRequest {
  return {
    id: "context-capacity-test",
    taskId: "task-context-capacity",
    missionId: "mission-context-capacity",
    messages: [{ role: "user", content }],
    requiredCapabilities: ["coding"],
    inputModalities: ["text"],
    outputModality: "text",
    maxOutputTokens: 4_000,
    allowToolProposals: false,
    ...options,
  };
}

const small = estimateModelContextCapacity(request("Fix the failing test."));
assert(small.estimatedInputTokens > 0, "input token estimate must be positive");
assert(small.reservedOutputTokens === 4_000, "declared output budget must be reserved");
assert(small.safetyMarginTokens >= 1_024, "minimum context safety margin must be preserved");
assert(
  small.requiredContextTokens ===
    small.estimatedInputTokens + small.reservedOutputTokens + small.safetyMarginTokens,
  "required context must account for input, output, and safety headroom",
);

const large = estimateModelContextCapacity(
  request("x".repeat(120_000)),
);
assert(
  large.requiredContextTokens > 32_000,
  "repository-scale prompts must exceed a 32k route when the estimated envelope cannot fit",
);

const withTools = estimateModelContextCapacity(
  request("Use the authorized repository tool.", {
    allowToolProposals: true,
    toolDefinitions: [
      {
        toolId: "repository-edit",
        description: "Apply an authorized repository edit.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    ],
  }),
);
assert(
  withTools.toolSchemaCharacters > 0,
  "provider-visible tool schemas must count toward the context envelope",
);
assert(
  withTools.requiredContextTokens > small.requiredContextTokens,
  "tool schemas must increase the required context budget",
);

const defaultOutput = estimateModelContextCapacity(
  request("Short task", { maxOutputTokens: undefined }),
);
assert(
  defaultOutput.reservedOutputTokens === 2_048,
  "requests without an explicit output budget must still reserve completion capacity",
);

console.log("K.I.N.G.S. MODEL CONTEXT CAPACITY ESTIMATION: SUCCESS");
