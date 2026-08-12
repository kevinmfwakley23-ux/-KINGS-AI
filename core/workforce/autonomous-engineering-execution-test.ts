import {
  AutonomousEngineeringExecutionAuthority,
} from "./autonomous-engineering-execution";

import type {
  ProjectEngineeringProfile,
} from "./project-engineering-profile";

import type {
  EngineeringWorkUnitPlan,
} from "./engineering-work-unit-bridge";

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
    new AutonomousEngineeringExecutionAuthority();

  const profile:
    ProjectEngineeringProfile =
    {
      id:
        "project-tree-0810",
      projectPath:
        "/projects/example",
      languages: [
        {
          language:
            "typescript",
          fileCount:
            20,
          extensions: [
            ".ts",
          ],
        },
        {
          language:
            "python",
          fileCount:
            10,
          extensions: [
            ".py",
          ],
        },
      ],
      requiredOperations: [
        "build",
        "test",
        "run",
      ],
      verifiedToolchains: [],
      unsupportedLanguages: [],
      buildReady:
        true,
      testReady:
        true,
      debugReady:
        true,
    };

  const plan:
    EngineeringWorkUnitPlan =
    {
      id:
        "engineering-plan-project-tree-0810",
      projectId:
        "project-tree-0810",
      requirements: [
        {
          language:
            "typescript",
          operations: [
            "build",
            "test",
            "run",
          ],
          required:
            true,
        },
        {
          language:
            "python",
          operations: [
            "build",
            "test",
            "run",
          ],
          required:
            true,
        },
      ],
      capabilityIds: [
        "engineering-typescript",
        "engineering-python",
      ],
      blocked:
        false,
      blockReasons: [],
    };

  const execution =
    authority.plan({
      id:
        "execution-tree-0810",
      projectId:
        "project-tree-0810",
      profile,
      plan,
    });

  assert(
    execution.status ===
      "ready",
    "Verified engineering project must produce a ready execution.",
  );

  assert(
    execution.steps.length ===
      6,
    "Two languages with three required operations each must produce six governed steps.",
  );

  assert(
    execution.currentStepId ===
      execution.steps[0].id,
    "Execution must begin at the first governed step.",
  );

  console.log(
    "08.10 autonomous engineering plan creation: SUCCESS",
  );

  let progressed =
    execution;

  for (
    const step of
      execution.steps
  ) {
    progressed =
      authority.completeStep(
        progressed,
        step.id,
      );
  }

  assert(
    progressed.status ===
      "completed",
    "Execution must complete after every governed engineering step succeeds.",
  );

  assert(
    progressed.completedStepIds.length ===
      6,
    "Every engineering step must be durably represented as completed.",
  );

  console.log(
    "08.10 governed multi-language execution: SUCCESS",
  );

  const blocked =
    authority.plan({
      id:
        "execution-tree-0810-blocked",
      projectId:
        "project-tree-0810-blocked",
      profile: {
        ...profile,
        buildReady:
          false,
        testReady:
          false,
        debugReady:
          false,
      },
      plan: {
        ...plan,
        blocked:
          true,
        blockReasons: [
          "Python test toolchain unavailable.",
        ],
      },
    });

  assert(
    blocked.status ===
      "blocked",
    "Blocked engineering plans must not enter execution.",
  );

  assert(
    blocked.steps.length ===
      0,
    "Blocked engineering execution must not generate executable steps.",
  );

  console.log(
    "08.10 unavailable capability execution blocking: SUCCESS",
  );

  console.log(
    "TREE-08.10 AUTONOMOUS ENGINEERING EXECUTION: SUCCESS",
  );
}

main();
