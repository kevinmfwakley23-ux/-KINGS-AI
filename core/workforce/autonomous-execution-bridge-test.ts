import {
  AutonomousExecutionBridge,
} from "./autonomous-execution-bridge";

import type {
  AutonomousEngineeringHandoff,
} from "./autonomous-engineering-handoff";

import type {
  AutonomousEngineeringPlan,
} from "./autonomous-engineering-execution";

import type {
  EngineeringExecutionResult,
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
  const bridge =
    new AutonomousExecutionBridge();

  const plan:
    AutonomousEngineeringPlan =
    {
      id:
        "engineering-plan-tree-0830",
      projectId:
        "project-tree-0830",
      steps: [
        {
          id:
            "engineering-step-tree-0830",
          language:
            "typescript",
          operation:
            "build",
        },
      ],
    };

  const handoff:
    AutonomousEngineeringHandoff =
    {
      id:
        "engineering-handoff-project-tree-0830",
      projectId:
        "project-tree-0830",
      readinessId:
        "engineering-readiness-project-tree-0830",
      planId:
        "engineering-plan-tree-0830",
      authorized:
        true,
      handedOffAt:
        "2026-08-12T15:20:00Z",
    };

  const execution:
    EngineeringExecutionResult =
    {
      id:
        "engineering-execution-tree-0830",
      projectId:
        "project-tree-0830",
      planId:
        "engineering-plan-tree-0830",
      started:
        true,
    };

  const result =
    bridge.start(
      handoff,
      plan,
      execution,
    );

  assert(
    result.authorized,
    "Authorized handoff must remain authorized at execution.",
  );

  assert(
    result.executionStarted,
    "Authorized engineering execution must start.",
  );

  assert(
    result.projectId ===
      plan.projectId,
    "Execution bridge must preserve project identity.",
  );

  console.log(
    "08.30 autonomous execution bridge: SUCCESS",
  );

  const blockedHandoff:
    AutonomousEngineeringHandoff =
    {
      ...handoff,
      authorized:
        false,
    };

  expectFailure(
    () =>
      bridge.start(
        blockedHandoff,
        plan,
        execution,
      ),
    "Unauthorized handoffs must never start execution.",
  );

  console.log(
    "08.30 authorization boundary protection: SUCCESS",
  );

  const wrongPlan:
    AutonomousEngineeringPlan =
    {
      ...plan,
      id:
        "different-plan",
    };

  expectFailure(
    () =>
      bridge.start(
        handoff,
        wrongPlan,
        execution,
      ),
    "Execution must match the authorized engineering plan.",
  );

  console.log(
    "08.30 plan identity enforcement: SUCCESS",
  );

  const wrongProjectExecution:
    EngineeringExecutionResult =
    {
      ...execution,
      projectId:
        "wrong-project",
    };

  expectFailure(
    () =>
      bridge.start(
        handoff,
        plan,
        wrongProjectExecution,
      ),
    "Execution must belong to the authorized project.",
  );

  console.log(
    "08.30 execution project enforcement: SUCCESS",
  );

  const notStarted:
    EngineeringExecutionResult =
    {
      ...execution,
      started:
        false,
    };

  expectFailure(
    () =>
      bridge.start(
        handoff,
        plan,
        notStarted,
      ),
    "Execution that did not start must not be reported as started.",
  );

  console.log(
    "08.30 execution-start verification: SUCCESS",
  );

  console.log(
    "TREE-08.30 AUTONOMOUS EXECUTION BRIDGE: SUCCESS",
  );
}

main();
