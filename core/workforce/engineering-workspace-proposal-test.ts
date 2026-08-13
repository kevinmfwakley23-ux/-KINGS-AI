import type {
  AutonomousEngineeringExecution,
  EngineeringExecutionStep,
} from "./autonomous-engineering-execution";

import {
  EngineeringWorkspaceAuthority,
} from "./engineering-workspace";

import {
  EngineeringWorkspaceProposalAuthority,
} from "./engineering-workspace-proposal";

import type {
  LocalCodingChangeProposal,
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

function createExecution():
  AutonomousEngineeringExecution {
  return {
    id:
      "engineering-execution-006",
    projectId:
      "project-006",
    status:
      "ready",
    steps: [
      createStep(),
    ],
    currentStepId:
      "step-006",
    completedStepIds: [],
    blockedReasons: [],
  };
}

function createStep():
  EngineeringExecutionStep {
  return {
    id:
      "step-006",
    language:
      "typescript",
    operation:
      "create",
    capabilityId:
      "engineering-typescript",
    sequence:
      1,
  };
}

function createWorkspace() {
  const authority =
    new EngineeringWorkspaceAuthority();

  return authority.create({
    id:
      "workspace-006",
    projectId:
      "project-006",
    rootPath:
      "/workspace/project-006",
    allowedPaths: [
      "core/workforce",
    ],
    allowedLanguages: [
      "typescript",
    ],
    allowedOperations: [
      "create",
    ],
  });
}

function createProposal():
  LocalCodingChangeProposal {
  return {
    id:
      "proposal-006",
    taskId:
      "step-006",
    missionId:
      "project-006",
    summary:
      "Create bounded local coding change.",
    changes: [
      {
        path:
          "core/workforce/generated-local.ts",
        operation:
          "create",
        content:
          "export const generatedLocal = true;",
      },
    ],
  };
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
  const proposalAuthority =
    new EngineeringWorkspaceProposalAuthority(
      new EngineeringWorkspaceAuthority(),
    );

  const execution =
    createExecution();

  const step =
    createStep();

  const workspace =
    createWorkspace();

  const result =
    proposalAuthority.authorize({
      execution,
      step,
      workspace,
      proposal:
        createProposal(),
    });

  assert(
    result.command.allowed,
    "Authorized workspace proposal must produce an allowed engineering command.",
  );

  assert(
    result.changes.length ===
      1,
    "Authorized proposal must preserve the proposed file change.",
  );

  assert(
    result.changes[0].language ===
      "typescript",
    "File language must be derived and preserved.",
  );

  assert(
    result.changes[0].path ===
      "core/workforce/generated-local.ts",
    "Authorized path must be preserved.",
  );

  console.log(
    "06.WORKSPACE authorized local-code change: SUCCESS",
  );

  expectFailure(
    () =>
      proposalAuthority.authorize({
        execution,
        step,
        workspace,
        proposal: {
          ...createProposal(),
          changes: [
            {
              ...createProposal()
                .changes[0],
              path:
                "package.json",
            },
          ],
        },
      }),
    "Paths outside the authorized workspace must be rejected.",
  );

  console.log(
    "06.WORKSPACE path-boundary protection: SUCCESS",
  );

  expectFailure(
    () =>
      proposalAuthority.authorize({
        execution,
        step,
        workspace,
        proposal: {
          ...createProposal(),
          changes: [
            {
              ...createProposal()
                .changes[0],
              path:
                "core/workforce/generated.py",
            },
          ],
        },
      }),
    "Unauthorized programming languages must be rejected.",
  );

  console.log(
    "06.WORKSPACE language authorization: SUCCESS",
  );

  expectFailure(
    () =>
      proposalAuthority.authorize({
        execution,
        step: {
          ...step,
          operation:
            "build",
        },
        workspace,
        proposal:
          createProposal(),
      }),
    "Unauthorized engineering operations must be rejected.",
  );

  console.log(
    "06.WORKSPACE operation authorization: SUCCESS",
  );

  expectFailure(
    () =>
      proposalAuthority.authorize({
        execution: {
          ...execution,
          currentStepId:
            "different-step",
        },
        step,
        workspace,
        proposal:
          createProposal(),
      }),
    "Non-current engineering steps must be rejected.",
  );

  console.log(
    "06.WORKSPACE current-step protection: SUCCESS",
  );

  expectFailure(
    () =>
      proposalAuthority.authorize({
        execution,
        step,
        workspace: {
          ...workspace,
          active:
            false,
        },
        proposal:
          createProposal(),
      }),
    "Inactive engineering workspaces must be rejected.",
  );

  console.log(
    "06.WORKSPACE inactive-workspace protection: SUCCESS",
  );

  console.log(
    "TREE-06 ENGINEERING WORKSPACE PROPOSAL AUTHORITY: SUCCESS",
  );
}

main();
