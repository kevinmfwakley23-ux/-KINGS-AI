import type {
  ModelExecutionResult,
} from "./model-interface";

import {
  GovernedLocalCodingProposal,
} from "./local-coding-change-proposal";

import {
  LocalCodingJsonProposalParser,
} from "./local-coding-json-proposal-parser";

import {
  buildLocalCodingRepairRequest,
} from "./local-coding-repair-request";

import type {
  LocalEngineeringExecutionReport,
} from "./local-engineering-execution-runner";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function expectFailure(
  operation: () => unknown,
  pattern: RegExp,
  message: string,
): void {
  let failure = "";
  try {
    operation();
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  assert(pattern.test(failure), `${message}. Actual error: ${failure || "<none>"}`);
}

function successfulModelResult(content: string): ModelExecutionResult {
  return {
    success: true,
    response: {
      requestId: "repair-request-1",
      model: {
        providerId: "internal-intelligence",
        modelId: "qwen2.5-coder:0.5b",
        displayName: "Local coding model",
        providerKind: "internal-local",
        capabilities: ["coding", "debugging", "recovery"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: 32_768,
        supportsToolCalling: false,
        supportsStructuredOutput: false,
        available: true,
      },
      content,
      toolCallProposals: [],
      usage: {
        elapsedMs: 12,
        tokensUsed: 40,
        iterationsUsed: 1,
        inputTokens: 20,
        outputTokens: 20,
        estimatedCost: 0,
      },
      metadata: {
        requestId: "repair-request-1",
        startedAt: "2026-09-05T15:30:00.000Z",
        completedAt: "2026-09-05T15:30:00.012Z",
        latencyMs: 12,
      },
    },
  };
}

function failureReport(): LocalEngineeringExecutionReport {
  return {
    status: "failed",
    execution: {
      id: "execution-repair-project",
      projectId: "repair-project",
      status: "failed",
      steps: [
        {
          id: "step-test",
          language: "typescript",
          operation: "test",
          capabilityId: "engineering-typescript",
          sequence: 1,
        },
      ],
      currentStepId: "step-test",
      completedStepIds: [],
      blockedReasons: [],
    },
    failedStepId: "step-test",
    failureReason: "Engineering test step exited with code 1.",
    evidence: [
      {
        executionStepId: "step-test",
        sequence: 1,
        language: "typescript",
        operation: "test",
        command: "npm",
        args: ["test"],
        resolvedExecutable: "npm",
        resolvedArgs: ["test"],
        started: true,
        exitCode: 1,
        succeeded: false,
        timedOut: false,
        durationMs: 42,
        stdout: "",
        stderr: "src/math.ts:4 expected 4 but received 5",
        stdoutTruncated: false,
        stderrTruncated: false,
      },
    ],
  };
}

function main(): void {
  const parser = new LocalCodingJsonProposalParser();
  const payload = {
    id: "proposal-step-test",
    taskId: "step-test",
    missionId: "repair-project",
    summary: "Correct the off-by-one return value.",
    changes: [
      {
        path: "src/math.ts",
        operation: "replace",
        content: "export const add = (a: number, b: number) => a + b;\n",
      },
    ],
  };

  const parsed = parser.parse(successfulModelResult(JSON.stringify(payload)));
  assert(parsed.changes.length === 1, "Raw JSON model output must become a typed change proposal.");
  assert(parsed.changes[0].path === "src/math.ts", "Parsed proposal must preserve the repository-relative path.");
  assert(parsed.changes[0].operation === "replace", "Parsed proposal must preserve the governed operation.");
  console.log("06.MODEL-PROPOSAL raw JSON parse: SUCCESS");

  const fenced = parser.parse(
    successfulModelResult(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``),
  );
  assert(fenced.taskId === "step-test", "A single JSON markdown fence must be tolerated for local models that ignore no-fence prompting.");
  console.log("06.MODEL-PROPOSAL fenced JSON parse: SUCCESS");

  const request = buildLocalCodingRepairRequest({
    requestId: "repair-request-1",
    taskId: "step-test",
    missionId: "repair-project",
    objective: "Repair the failing arithmetic test without changing unrelated behavior.",
    report: failureReport(),
    allowedPaths: ["src/math.ts"],
    contextFiles: [
      {
        path: "src/math.ts",
        content: "export const add = (a: number, b: number) => a + b + 1;\n",
      },
    ],
  });

  assert(request.taskId === "step-test" && request.missionId === "repair-project", "Repair request must preserve engineering identity for later authorization.");
  assert(request.requiredCapabilities.includes("coding") && request.requiredCapabilities.includes("debugging") && request.requiredCapabilities.includes("recovery"), "Repair request must route only to models capable of coding recovery.");
  assert(request.allowToolProposals === false, "Repair proposal generation must not grant tool execution.");
  assert(request.requireStructuredOutput === false, "Strict parser must permit local text models without native structured-output mode.");
  const prompt = request.messages.map((message) => message.content).join("\n");
  assert(prompt.includes('"src/math.ts"'), "Prompt must carry the exact governed path allow-list.");
  assert(prompt.includes("expected 4 but received 5"), "Prompt must carry the real failed validation evidence.");
  assert(prompt.includes("a + b + 1"), "Prompt must include already-governed source context needed for a complete replacement.");
  assert(prompt.includes("untrusted"), "Prompt must explicitly isolate repository/test text as untrusted model data.");
  console.log("06.MODEL-PROPOSAL real failure request contract: SUCCESS");

  const governed = new GovernedLocalCodingProposal().propose(
    {
      response: successfulModelResult(JSON.stringify(payload)),
      request,
      allowedPaths: ["src/math.ts"],
    },
    parser,
  );
  assert(governed.missionId === "repair-project", "Parsed model output must pass through the existing mission identity authority.");
  assert(governed.changes[0].content.includes("a + b"), "Governed proposal must retain complete replacement content.");
  console.log("06.MODEL-PROPOSAL parser -> governed proposal authority: SUCCESS");

  expectFailure(
    () => parser.parse(successfulModelResult(JSON.stringify({
      ...payload,
      changes: [{ path: "../outside.ts", operation: "replace", content: "unsafe" }],
    }))),
    /unsafe traversal/i,
    "Traversal from model output must fail before workspace authorization",
  );
  expectFailure(
    () => parser.parse(successfulModelResult(JSON.stringify({
      ...payload,
      changes: [
        { path: "src/math.ts", operation: "replace", content: "one" },
        { path: "src/math.ts", operation: "replace", content: "two" },
      ],
    }))),
    /duplicate file target/i,
    "Duplicate model targets must fail closed",
  );
  expectFailure(
    () => parser.parse(successfulModelResult(JSON.stringify({
      ...payload,
      changes: [{ path: "src/math.ts", operation: "delete", content: "x" }],
    }))),
    /create or replace/i,
    "Destructive model operations must fail closed",
  );
  expectFailure(
    () => parser.parse(successfulModelResult(`${JSON.stringify(payload)}\nextra prose`)),
    /not valid JSON/i,
    "Model prose outside the JSON contract must fail closed",
  );
  expectFailure(
    () => new GovernedLocalCodingProposal().propose(
      {
        response: successfulModelResult(JSON.stringify({
          ...payload,
          missionId: "wrong-mission",
        })),
        request,
        allowedPaths: ["src/math.ts"],
      },
      parser,
    ),
    /mission identity mismatch/i,
    "Parsed model identity must still be verified by the existing governed proposal authority",
  );
  expectFailure(
    () => buildLocalCodingRepairRequest({
      requestId: "repair-request-2",
      taskId: "step-test",
      missionId: "repair-project",
      objective: "Unsafe context proof",
      report: failureReport(),
      allowedPaths: ["src/math.ts"],
      contextFiles: [{ path: "package.json", content: "{}" }],
    }),
    /outside the allowed repair paths/i,
    "Source context outside the governed repair allow-list must be rejected",
  );

  console.log("06.MODEL-PROPOSAL malformed/unsafe model output: BLOCKED");
  console.log("TREE-06 REAL MODEL -> GOVERNED CODING PROPOSAL BOUNDARY: SUCCESS");
}

main();
