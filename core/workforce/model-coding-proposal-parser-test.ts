import type { ModelExecutionResult } from "./model-interface";
import { ModelCodingProposalParser } from "./model-coding-proposal-parser";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function response(content: string): ModelExecutionResult {
  return {
    success: true,
    response: {
      requestId: "model-request-parser-001",
      model: {
        providerId: "internal-intelligence",
        modelId: "local-test-model",
        displayName: "K.I.N.G.S. Parser Test Model",
        providerKind: "internal-local",
        capabilities: ["coding"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: 32768,
        supportsToolCalling: false,
        supportsStructuredOutput: false,
        available: true,
      },
      content,
      toolCallProposals: [],
      usage: {
        elapsedMs: 1,
        tokensUsed: 10,
        iterationsUsed: 1,
        estimatedCost: 0,
        inputTokens: 5,
        outputTokens: 5,
      },
      metadata: {
        requestId: "model-request-parser-001",
        startedAt: "2026-08-17T00:00:00.000Z",
        completedAt: "2026-08-17T00:00:00.001Z",
        latencyMs: 1,
      },
    },
  };
}

function main(): void {
  const parser = new ModelCodingProposalParser({
    expectedTaskId: "task-parser-001",
    expectedMissionId: "mission-parser-001",
    allowedPaths: [
      "src/generated.ts",
      "test/generated.test.ts",
    ],
    expectedFilePaths: [
      "src/generated.ts",
      "test/generated.test.ts",
    ],
    allowMultipleFiles: true,
  });

  const parsed = parser.parse(
    response(
      [
        "FILE: src/generated.ts [create]",
        "```typescript",
        "export const generatedValue = 42;",
        "```",
        "",
        "FILE: test/generated.test.ts [create]",
        "```typescript",
        "import { generatedValue } from '../src/generated';",
        "if (generatedValue !== 42) throw new Error('verification failed');",
        "```",
      ].join("\n"),
    ),
  );

  assert(parsed.changes.length === 2, "Parser must produce both authorized file changes.");
  assert(parsed.changes[0].path === "src/generated.ts", "First file path must be preserved.");
  assert(parsed.changes[1].path === "test/generated.test.ts", "Second file path must be preserved.");
  assert(parsed.changes[0].content.includes("generatedValue = 42"), "Code fences must be normalized away.");

  console.log("K.I.N.G.S. MODEL CODING PROPOSAL → MULTI-FILE PARSING: SUCCESS");

  let malformedRejected = false;
  try {
    parser.parse(response("Here is the code you requested:\n```typescript\nexport const x = 1;\n```"));
  } catch {
    malformedRejected = true;
  }
  assert(malformedRejected, "Conversational model output must be rejected.");
  console.log("K.I.N.G.S. MODEL CODING PROPOSAL → MALFORMED OUTPUT REJECTION: SUCCESS");

  let unauthorizedRejected = false;
  try {
    parser.parse(
      response([
        "FILE: src/secret.ts [create]",
        "export const secret = true;",
      ].join("\n")),
    );
  } catch {
    unauthorizedRejected = true;
  }
  assert(unauthorizedRejected, "Unauthorized model paths must be rejected.");
  console.log("K.I.N.G.S. MODEL CODING PROPOSAL → PATH REJECTION: SUCCESS");

  console.log("TREE-KCM-MODEL-CODING-PROPOSAL: SUCCESS");
}

main();
