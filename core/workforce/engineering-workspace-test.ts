import {
  EngineeringWorkspaceAuthority,
} from "./engineering-workspace";

import type {
  ToolchainOperation,
} from "./engineering-toolchain";

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

function main(): void {
  const authority =
    new EngineeringWorkspaceAuthority();

  const workspace =
    authority.create({
      id:
        "workspace-tree-0811",
      projectId:
        "project-tree-0811",
      rootPath:
        "/projects/tree-0811",
      allowedPaths: [
        "/projects/tree-0811",
      ],
      allowedLanguages: [
        "typescript",
        "python",
      ],
      allowedOperations: [
        "build",
        "test",
        "run",
      ],
    });

  const execution = {
    id:
      "execution-tree-0811",
    projectId:
      "project-tree-0811",
    status:
      "ready" as const,
    steps: [
      {
        id:
          "step-tree-0811",
        language:
          "typescript" as const,
        operation:
          "build" as const,
        capabilityId:
          "engineering-typescript",
        sequence:
          1,
      },
    ],
    currentStepId:
      "step-tree-0811",
    completedStepIds: [],
    blockedReasons: [],
  };

  const allowed =
    authority.authorizeStep(
      workspace,
      execution,
      execution.steps[0],
    );

  assert(
    allowed.allowed,
    "Authorized language and operation must produce an allowed engineering command.",
  );

  assert(
    allowed.workingDirectory ===
      "/projects/tree-0811",
    "Authorized command must remain inside the governed project workspace.",
  );

  console.log(
    "08.11 governed workspace creation: SUCCESS",
  );

  console.log(
    "08.11 engineering command authorization: SUCCESS",
  );

  const deniedLanguage =
    authority.authorizeStep(
      workspace,
      execution,
      {
        ...execution.steps[0],
        id:
          "step-tree-0811-rust",
        language:
          "rust",
      },
    );

  assert(
    !deniedLanguage.allowed,
    "Unauthorized language must be rejected.",
  );

  console.log(
    "08.11 unauthorized language rejection: SUCCESS",
  );

  const restrictedWorkspace = {
    ...workspace,
    allowedOperations: [
      "build",
    ] as ToolchainOperation[],
  };

  const deniedOperation =
    authority.authorizeStep(
      restrictedWorkspace,
      execution,
      {
        ...execution.steps[0],
        id:
          "step-tree-0811-test",
        operation:
          "test",
      },
    );

  assert(
    !deniedOperation.allowed,
    "Unauthorized operation must be rejected.",
  );

  console.log(
    "08.11 unauthorized operation rejection: SUCCESS",
  );

  const wrongStep =
    authority.authorizeStep(
      workspace,
      execution,
      {
        ...execution.steps[0],
        id:
          "step-tree-0811-wrong",
      },
    );

  assert(
    !wrongStep.allowed,
    "Non-current execution step must be rejected.",
  );

  console.log(
    "08.11 execution sequence enforcement: SUCCESS",
  );

  console.log(
    "TREE-08.11 GOVERNED ENGINEERING WORKSPACE: SUCCESS",
  );
}

main();
