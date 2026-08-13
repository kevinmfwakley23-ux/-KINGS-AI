import type {
  ModelExecutionResult,
  ModelExecutionRequest,
} from "./model-interface";

import {
  GovernedLocalCodingProposal,
  type LocalCodingChangeProposal,
  type LocalCodingProposalParser,
} from "./local-coding-change-proposal";

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

function successfulResponse():
  ModelExecutionResult {
  return {
    success:
      true,
    response: {
      requestId:
        "request-local-coding-proposal",
      model: {
        providerId:
          "internal-intelligence",
        modelId:
          "qwen2.5-coder:0.5b",
        displayName:
          "Ollama: qwen2.5-coder:0.5b",
        providerKind:
          "internal-local",
        capabilities: [
          "coding",
          "reasoning",
        ],
        inputModalities: [
          "text",
        ],
        outputModalities: [
          "text",
        ],
        contextWindowTokens:
          32768,
        supportsToolCalling:
          true,
        supportsStructuredOutput:
          false,
        available:
          true,
      },
      content:
        "PROPOSED_CHANGE",
      toolCallProposals: [],
      usage: {
        elapsedMs:
          10,
        tokensUsed:
          10,
        iterationsUsed:
          1,
        inputTokens:
          5,
        outputTokens:
          5,
        estimatedCost:
          0,
      },
      metadata: {
        requestId:
          "request-local-coding-proposal",
        startedAt:
          "2026-08-13T00:00:00.000Z",
        completedAt:
          "2026-08-13T00:00:00.010Z",
        latencyMs:
          10,
      },
    },
  };
}

function request():
  ModelExecutionRequest {
  return {
    id:
      "request-local-coding-proposal",
    taskId:
      "task-local-coding-proposal",
    missionId:
      "mission-local-coding-proposal",
    messages: [],
    requiredCapabilities: [
      "coding",
    ],
    inputModalities: [
      "text",
    ],
    outputModality:
      "text",
    allowToolProposals:
      false,
  };
}

class TestParser
  implements LocalCodingProposalParser {
  parse():
    LocalCodingChangeProposal {
    return {
      id:
        "proposal-local-coding-001",
      taskId:
        "task-local-coding-proposal",
      missionId:
        "mission-local-coding-proposal",
      summary:
        "Add bounded test helper.",
      changes: [
        {
          path:
            "core/workforce/generated-test.ts",
          operation:
            "create",
          content:
            "export const generated = true;",
        },
      ],
    };
  }
}

class UnauthorizedParser
  implements LocalCodingProposalParser {
  parse():
    LocalCodingChangeProposal {
    return {
      id:
        "proposal-local-coding-002",
      taskId:
        "task-local-coding-proposal",
      missionId:
        "mission-local-coding-proposal",
      summary:
        "Unauthorized change.",
      changes: [
        {
          path:
            "package.json",
          operation:
            "replace",
          content:
            "{}",
        },
      ],
    };
  }
}

function expectFailure(
  operation:
    () => void,
  message:
    string,
): void {
  let failed =
    false;

  try {
    operation();
  } catch {
    failed =
      true;
  }

  assert(
    failed,
    message,
  );
}

function main(): void {
  const authority =
    new GovernedLocalCodingProposal();

  const allowedPaths = [
    "core/workforce/generated-test.ts",
  ];

  const proposal =
    authority.propose(
      {
        response:
          successfulResponse(),
        request:
          request(),
        allowedPaths,
      },
      new TestParser(),
    );

  assert(
    proposal.changes.length ===
      1,
    "Authorized coding proposal must contain its change.",
  );

  assert(
    proposal.changes[0].path ===
      "core/workforce/generated-test.ts",
    "Authorized proposal must preserve the approved path.",
  );

  console.log(
    "06.LOCAL-CODING proposal acceptance: SUCCESS",
  );

  expectFailure(
    () =>
      authority.propose(
        {
          response:
            successfulResponse(),
          request:
            request(),
          allowedPaths,
        },
        new UnauthorizedParser(),
      ),
    "Unauthorized coding paths must be blocked.",
  );

  console.log(
    "06.LOCAL-CODING path authorization: SUCCESS",
  );

  const mismatchedTask =
    authority;

  let taskRejected =
    false;

  try {
    mismatchedTask.propose(
      {
        response:
          successfulResponse(),
        request: {
          ...request(),
          taskId:
            "different-task",
        },
        allowedPaths,
      },
      new TestParser(),
    );
  } catch {
    taskRejected =
      true;
  }

  assert(
    taskRejected,
    "Task identity mismatches must be blocked.",
  );

  console.log(
    "06.LOCAL-CODING task identity protection: SUCCESS",
  );

  console.log(
    "TREE-06 GOVERNED LOCAL CODING PROPOSAL: SUCCESS",
  );
}

main();
