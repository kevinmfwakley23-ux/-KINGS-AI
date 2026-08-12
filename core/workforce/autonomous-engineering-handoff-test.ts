import {
  AutonomousEngineeringHandoffAuthority,
} from "./autonomous-engineering-handoff";

import type {
  EngineeringReadinessResult,
} from "./engineering-readiness-bridge";

import type {
  AutonomousEngineeringPlan,
} from "./autonomous-engineering-execution";

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

function expectFailure(
  action:
    () => void,
  message:
    string,
): void {
  let failed =
    false;

  try {
    action();
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
    new AutonomousEngineeringHandoffAuthority();

  const readiness:
    EngineeringReadinessResult =
    {
      readiness: {
        id:
          "engineering-readiness-tree-0829",
        projectId:
          "project-tree-0829",
        auditId:
          "audit-tree-0829",
        closureId:
          "closure-tree-0829",
        ready:
          true,
        verifiedAt:
          "2026-08-12T15:00:00Z",
      },
      audit: {
        id:
          "audit-tree-0829",
        projectId:
          "project-tree-0829",
        requiredLanguages: [
          "typescript",
        ],
        requiredOperations: [
          "build",
          "test",
          "run",
        ],
        verifiedLanguages: [
          "typescript",
        ],
        missingLanguages: [],
        verifiedOperations: [
          "build",
          "test",
          "run",
        ],
        missingOperations: [],
        ready:
          true,
      },
    };

  const plan:
    AutonomousEngineeringPlan =
    {
      id:
        "engineering-plan-tree-0829",
      projectId:
        "project-tree-0829",
      steps: [
        {
          id:
            "engineering-step-tree-0829",
          language:
            "typescript",
          operation:
            "build",
        },
      ],
    };

  const handoff =
    authority.authorize(
      readiness,
      plan,
      "2026-08-12T15:01:00Z",
    );

  assert(
    handoff.authorized,
    "Engineering-ready projects must be authorized for autonomous execution.",
  );

  assert(
    handoff.projectId ===
      "project-tree-0829",
    "Autonomous handoff must preserve project identity.",
  );

  console.log(
    "08.29 autonomous engineering handoff: SUCCESS",
  );

  const unready:
    EngineeringReadinessResult =
    {
      ...readiness,
      readiness: {
        ...readiness.readiness,
        ready:
          false,
      },
    };

  expectFailure(
    () =>
      authority.authorize(
        unready,
        plan,
        "2026-08-12T15:02:00Z",
      ),
    "Unready projects must not enter autonomous execution.",
  );

  console.log(
    "08.29 readiness authorization protection: SUCCESS",
  );

  const wrongProjectPlan:
    AutonomousEngineeringPlan =
    {
      ...plan,
      projectId:
        "wrong-project",
    };

  expectFailure(
    () =>
      authority.authorize(
        readiness,
        wrongProjectPlan,
        "2026-08-12T15:03:00Z",
      ),
    "Autonomous handoff must enforce project identity.",
  );

  console.log(
    "08.29 project identity enforcement: SUCCESS",
  );

  const emptyPlan:
    AutonomousEngineeringPlan =
    {
      ...plan,
      steps: [],
    };

  expectFailure(
    () =>
      authority.authorize(
        readiness,
        emptyPlan,
        "2026-08-12T15:04:00Z",
      ),
    "Autonomous handoff must reject empty engineering plans.",
  );

  console.log(
    "08.29 executable-plan enforcement: SUCCESS",
  );

  console.log(
    "TREE-08.29 AUTONOMOUS ENGINEERING HANDOFF: SUCCESS",
  );
}

main();
