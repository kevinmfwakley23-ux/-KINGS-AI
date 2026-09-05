import type {
  EngineeringRepairStep,
} from "./engineering-repair-planner";

import {
  EngineeringRepairWorkspaceProposalAuthority,
} from "./engineering-repair-workspace-proposal";

import type {
  EngineeringWorkspace,
} from "./engineering-workspace";

import {
  GovernedLocalCodingProposal,
  type LocalCodingChangeProposal,
  type LocalCodingProposalParser,
} from "./local-coding-change-proposal";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function expectFailure(
  operation: () => void,
  message: string,
): void {
  let failed = false;
  try {
    operation();
  } catch {
    failed = true;
  }
  assert(failed, message);
}

const workspaceRoot =
  "/tmp/kings-v1-workspace-path-proof";

const taskId =
  "repair-step-v1-workspace-path-edit";

const projectId =
  "project-v1-workspace-path";

function request(): ModelExecutionRequest {
  return {
    id: "request-v1-workspace-path",
    taskId,
    missionId: projectId,
    messages: [],
    requiredCapabilities: ["coding"],
    inputModalities: ["text"],
    outputModality: "text",
    allowToolProposals: false,
  };
}

function response(): ModelExecutionResult {
  return {
    success: true,
    response: {
      requestId: "request-v1-workspace-path",
      model: {
        providerId: "internal-intelligence",
        modelId: "workspace-path-proof-model",
        displayName: "Workspace path proof model",
        providerKind: "internal-local",
        capabilities: ["coding"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: 4096,
        supportsToolCalling: false,
        supportsStructuredOutput: true,
        available: true,
      },
      content: "workspace-path-proof",
      toolCallProposals: [],
      usage: {
        elapsedMs: 1,
        tokensUsed: 1,
        iterationsUsed: 1,
        inputTokens: 1,
        outputTokens: 1,
        estimatedCost: 0,
      },
      metadata: {
        requestId: "request-v1-workspace-path",
        startedAt: "2026-09-05T00:00:00.000Z",
        completedAt: "2026-09-05T00:00:00.001Z",
        latencyMs: 1,
      },
    },
  };
}

class ProposalParser
  implements LocalCodingProposalParser {
  constructor(
    private readonly path: string,
  ) {}

  parse(): LocalCodingChangeProposal {
    return {
      id: "proposal-v1-workspace-path",
      taskId,
      missionId: projectId,
      summary: "Prove workspace-relative path authorization.",
      changes: [
        {
          path: this.path,
          operation: "create",
          content: "export const kingsLocalMasterProof = true;",
        },
      ],
    };
  }
}

function workspace(): EngineeringWorkspace {
  return {
    id: "workspace-v1-path-proof",
    projectId,
    rootPath: workspaceRoot,
    allowedPaths: [workspaceRoot],
    allowedLanguages: ["typescript"],
    allowedOperations: ["create"],
    active: true,
  };
}

function step(): EngineeringRepairStep {
  return {
    id: taskId,
    strategy: "edit",
    description: "Create the bounded local master proof artifact.",
    reason: "Regression proof for issue #2.",
    required: true,
  };
}

function main(): void {
  const governed = new GovernedLocalCodingProposal();

  const relativeProposal = governed.propose(
    {
      response: response(),
      request: request(),
      allowedPaths: [workspaceRoot],
      workspaceRoot,
    },
    new ProposalParser(
      "generated/kingsLocalMasterProof.ts",
    ),
  );

  assert(
    relativeProposal.changes[0].path ===
      "generated/kingsLocalMasterProof.ts",
    "Authorized workspace-relative proposal path must be preserved.",
  );

  const workspaceAuthorized =
    new EngineeringRepairWorkspaceProposalAuthority().authorize({
      step: step(),
      workspace: workspace(),
      proposal: relativeProposal,
    });

  assert(
    workspaceAuthorized.changes[0].path ===
      "generated/kingsLocalMasterProof.ts",
    "Repair workspace authority must accept the workspace-relative proof path.",
  );

  console.log(
    "V1.WORKSPACE-PATH relative path authorization: SUCCESS",
  );

  const absoluteInside =
    `${workspaceRoot}/generated/absolute-proof.ts`;

  const absoluteProposal = governed.propose(
    {
      response: response(),
      request: request(),
      allowedPaths: [workspaceRoot],
      workspaceRoot,
    },
    new ProposalParser(absoluteInside),
  );

  new EngineeringRepairWorkspaceProposalAuthority().authorize({
    step: step(),
    workspace: workspace(),
    proposal: absoluteProposal,
  });

  console.log(
    "V1.WORKSPACE-PATH absolute in-workspace authorization: SUCCESS",
  );

  expectFailure(
    () =>
      governed.propose(
        {
          response: response(),
          request: request(),
          allowedPaths: [workspaceRoot],
          workspaceRoot,
        },
        new ProposalParser("../outside.ts"),
      ),
    "Workspace traversal must be rejected by the governed proposal boundary.",
  );

  expectFailure(
    () =>
      new EngineeringRepairWorkspaceProposalAuthority().authorize({
        step: step(),
        workspace: workspace(),
        proposal: {
          ...relativeProposal,
          changes: [
            {
              ...relativeProposal.changes[0],
              path: "../outside.ts",
            },
          ],
        },
      }),
    "Workspace traversal must be rejected by the repair workspace boundary.",
  );

  expectFailure(
    () =>
      governed.propose(
        {
          response: response(),
          request: request(),
          allowedPaths: [workspaceRoot],
          workspaceRoot,
        },
        new ProposalParser("/tmp/kings-outside.ts"),
      ),
    "Absolute paths outside the governed workspace must be rejected.",
  );

  console.log(
    "V1.WORKSPACE-PATH traversal and outside-root protection: SUCCESS",
  );

  console.log(
    "V1 WORKSPACE PATH AUTHORIZATION REGRESSION: SUCCESS",
  );
}

main();
