import {
  EngineeringWorkflowBridgeAuthority,
} from "./engineering-workflow-bridge";

import type {
  EngineeringCompletionResult,
} from "./engineering-completion-authority";

import type {
  EngineeringWorkflowTask,
} from "./engineering-workflow-bridge";

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
  const bridge =
    new EngineeringWorkflowBridgeAuthority();

  const completedTask:
    EngineeringWorkflowTask =
    {
      id:
        "task-build",
      projectId:
        "project-tree-0819",
      dependencyIds: [],
      status:
        "active",
    };

  const nextTask:
    EngineeringWorkflowTask =
    {
      id:
        "task-test",
      projectId:
        "project-tree-0819",
      dependencyIds: [
        "task-build",
      ],
      status:
        "blocked",
    };

  const finalTask:
    EngineeringWorkflowTask =
    {
      id:
        "task-package",
      projectId:
        "project-tree-0819",
      dependencyIds: [
        "task-test",
      ],
      status:
        "blocked",
    };

  const completion:
    EngineeringCompletionResult =
    {
      id:
        "completion-task-build",
      projectId:
        "project-tree-0819",
      taskId:
        "task-build",
      completed:
        true,
      reason:
        "All engineering criteria verified.",
      verificationId:
        "verification-tree-0819",
      unmetCriteria: [],
    };

  const advanced =
    bridge.advance(
      completedTask,
      completion,
      [
        completedTask,
        nextTask,
        finalTask,
      ],
    );

  assert(
    advanced.completed,
    "Verified engineering completion must advance the workflow.",
  );

  assert(
    advanced.task.status ===
      "completed",
    "Completed engineering task must become completed in workflow state.",
  );

  assert(
    advanced.unlockedTaskIds.includes(
      "task-test",
    ),
    "A task whose dependencies are satisfied must become unlocked.",
  );

  assert(
    !advanced.unlockedTaskIds.includes(
      "task-package",
    ),
    "Tasks with incomplete dependencies must remain blocked.",
  );

  console.log(
    "08.19 verified task workflow advancement: SUCCESS",
  );

  const incomplete:
    EngineeringCompletionResult =
    {
      ...completion,
      id:
        "completion-task-build-failed",
      completed:
        false,
      unmetCriteria: [
        "Tests must pass.",
      ],
    };

  const blocked =
    bridge.advance(
      completedTask,
      incomplete,
      [
        completedTask,
        nextTask,
      ],
    );

  assert(
    !blocked.completed,
    "Incomplete engineering work must not advance workflow state.",
  );

  assert(
    blocked.unlockedTaskIds.length ===
      0,
    "Incomplete engineering work must unlock no dependent tasks.",
  );

  console.log(
    "08.19 incomplete-engineering workflow protection: SUCCESS",
  );

  const parallelA:
    EngineeringWorkflowTask =
    {
      id:
        "task-parallel-a",
      projectId:
        "project-tree-0819",
      dependencyIds: [
        "task-build",
      ],
      status:
        "blocked",
    };

  const parallelB:
    EngineeringWorkflowTask =
    {
      id:
        "task-parallel-b",
      projectId:
        "project-tree-0819",
      dependencyIds: [
        "task-build",
      ],
      status:
        "blocked",
    };

  const parallel =
    bridge.advance(
      completedTask,
      completion,
      [
        completedTask,
        parallelA,
        parallelB,
      ],
    );

  assert(
    parallel.unlockedTaskIds.includes(
      "task-parallel-a",
    ) &&
    parallel.unlockedTaskIds.includes(
      "task-parallel-b",
    ),
    "Independent dependent branches must advance in parallel.",
  );

  console.log(
    "08.19 parallel engineering branch advancement: SUCCESS",
  );

  console.log(
    "TREE-08.19 ENGINEERING WORKFLOW BRIDGE: SUCCESS",
  );
}

main();
