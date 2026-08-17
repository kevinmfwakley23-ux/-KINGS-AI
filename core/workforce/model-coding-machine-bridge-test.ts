import type {
  ModelExecutionResult,
} from "./model-interface";

import {
  ModelCodingMachineBridge,
} from "./model-coding-machine-bridge";

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function modelResult(
  content: string,
): ModelExecutionResult {
  return {
    success: true,
    response: {
      requestId: "request-bridge-test",
      model: {
        providerId: "provider-test",
        modelId: "model-test",
        displayName: "Test Coding Model",
        providerKind: "internal-local",
        capabilities: [
          "coding",
          "structured-output",
        ],
        inputModalities: [
          "text",
        ],
        outputModalities: [
          "text",
        ],
        contextWindowTokens: 4096,
        supportsToolCalling: false,
        supportsStructuredOutput: true,
        available: true,
      },
      content,
      toolCallProposals: [],
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        maxTokens: 30,
        usedTokens: 20,
      },
      metadata: {
        requestId: "request-bridge-test",
        startedAt: new Date(0).toISOString(),
        completedAt: new Date(1).toISOString(),
        latencyMs: 1,
      },
    },
  };
}

function main(): void {
  const bridge =
    new ModelCodingMachineBridge();

  const baseExecution = {
    taskId: "task-bridge-test",
    projectId: "mission-bridge-test",
    workUnit: {
      id: "work-unit-bridge-test",
      role: "coding-engineer",
      objective: "Create a verified TypeScript file.",
      capabilityIds: [
        "engineering-typescript",
      ],
      allowedToolIds: [
        "tool-execution-sandbox",
      ],
      allowedPaths: [
        "src/bridge-proof.ts",
      ],
      budget: {
        maxTimeMs: 10000,
        maxTokens: 2000,
        maxIterations: 2,
      },
      dependencyIds: [],
      acceptanceCriteria: [
        "Bridge output is accepted as a governed coding proposal.",
      ],
      requiredEvidenceTypes: [
        "write",
        "test",
      ],
      approved: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    execution: {
      id: "execution-bridge-test",
      projectId: "mission-bridge-test",
      status: "ready" as const,
      steps: [
        {
          id: "task-bridge-test",
          language: "typescript" as const,
          operation: "create" as const,
          capabilityId: "engineering-typescript",
          sequence: 1,
        },
      ],
      currentStepId: "task-bridge-test",
      completedStepIds: [],
      blockedReasons: [],
    },
    step: {
      id: "task-bridge-test",
      language: "typescript" as const,
      operation: "create" as const,
      capabilityId: "engineering-typescript",
      sequence: 1,
    },
    workspace: {
      id: "workspace-bridge-test",
      projectId: "mission-bridge-test",
      rootPath: "/tmp/bridge-test",
      allowedPaths: [
        "src",
      ],
      allowedLanguages: [
        "typescript" as const,
      ],
      allowedOperations: [
        "create" as const,
      ],
      active: true,
    },
    repairStep: {
      id: "task-bridge-test",
      strategy: "edit" as const,
      description: "Create bridge-proof.ts.",
      reason: "Bridge integration proof.",
      required: true,
    },
    buildTestSteps: [
      {
        id: "verify-bridge-test",
        operation: "test" as const,
        command: "node",
        args: [
          "verify.js",
        ],
        workingDirectory: "/tmp/bridge-test",
      },
    ],
    requiredCriteria: [
      "Bridge output is accepted as a governed coding proposal.",
    ],
  };

  const valid =
    bridge.buildRequest({
      modelResult: modelResult(
        [
          "FILE: src/bridge-proof.ts [create]",
          "export const KINGS_BRIDGE_GREEN = true;",
        ].join("\n"),
      ),
      proposalParser: {
        expectedTaskId: "task-bridge-test",
        expectedMissionId: "mission-bridge-test",
        allowedPaths: [
          "src/bridge-proof.ts",
        ],
        expectedFilePaths: [
          "src/bridge-proof.ts",
        ],
        allowMultipleFiles: false,
      },
      execution: baseExecution,
    });

  assert(
    valid.request.proposal.taskId ===
      "task-bridge-test",
    "valid model output must preserve task identity",
  );

  assert(
    valid.request.proposal.missionId ===
      "mission-bridge-test",
    "valid model output must preserve mission identity",
  );

  assert(
    valid.request.proposal.changes.length === 1,
    "valid model output must produce exactly one coding change",
  );

  assert(
    valid.request.proposal.changes[0].path ===
      "src/bridge-proof.ts",
    "valid model output must preserve the authorized target path",
  );

  console.log(
    "K.I.N.G.S. MODEL → GOVERNED CODING PROPOSAL: SUCCESS",
  );

  let rejected = false;

  try {
    bridge.buildRequest({
      modelResult: modelResult(
        [
          "FILE: ../../outside.ts [create]",
          "export const BAD = true;",
        ].join("\n"),
      ),
      proposalParser: {
        expectedTaskId: "task-bridge-test",
        expectedMissionId: "mission-bridge-test",
        allowedPaths: [
          "src/bridge-proof.ts",
        ],
        allowMultipleFiles: false,
      },
      execution: baseExecution,
    });
  } catch {
    rejected = true;
  }

  assert(
    rejected,
    "unauthorized model-proposed paths must be rejected before execution",
  );

  console.log(
    "K.I.N.G.S. MODEL → UNAUTHORIZED PATH REJECTION: SUCCESS",
  );

  console.log(
    "TREE-KCM-MODEL-CODING-BRIDGE: SUCCESS",
  );
}

main();
