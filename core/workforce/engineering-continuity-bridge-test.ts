import {
  EngineeringContinuityBridgeAuthority,
} from "./engineering-continuity-bridge";

import type {
  DurableEngineeringWorkflow,
} from "./durable-engineering-workflow";

import type {
  EngineeringCompletionResult,
} from "./engineering-completion-authority";

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
    new EngineeringContinuityBridgeAuthority();

  const workflow:
    DurableEngineeringWorkflow =
    {
      id:
        "workflow-tree-0821",
      projectId:
        "project-tree-0821",
      tasks: [
        {
          id:
            "task-build",
          projectId:
            "project-tree-0821",
          dependencyIds: [],
          status:
            "completed",
        },
        {
          id:
            "task-test",
          projectId:
            "project-tree-0821",
          dependencyIds: [
            "task-build",
          ],
          status:
            "ready",
        },
        {
          id:
            "task-package",
          projectId:
            "project-tree-0821",
          dependencyIds: [
            "task-test",
          ],
          status:
            "blocked",
        },
      ],
      activeTaskId:
        "task-test",
      version:
        1,
      updatedAt:
        new Date().toISOString(),
    };

  const now =
    new Date().toISOString();

  const state =
    authority.create(
      workflow,
      now,
    );

  assert(
    state.completedTaskIds.includes(
      "task-build",
    ),
    "Completed engineering work must enter continuity state.",
  );

  assert(
    state.readyTaskIds.includes(
      "task-test",
    ),
    "Ready engineering work must enter continuity state.",
  );

  console.log(
    "08.21 engineering continuity creation: SUCCESS",
  );

  const interrupted =
    authority.interrupt(
      state,
      now,
    );

  assert(
    interrupted.interrupted,
    "Interrupted engineering workflows must persist interruption state.",
  );

  console.log(
    "08.21 engineering interruption persistence: SUCCESS",
  );

  const resumed =
    authority.resume(
      interrupted,
      workflow,
      now,
    );

  assert(
    !resumed.state.interrupted,
    "A resumed engineering workflow must clear interruption state.",
  );

  assert(
    resumed.state.resumeCount ===
      1,
    "Engineering continuity resume count must advance.",
  );

  assert(
    resumed.state.activeTaskId ===
      "task-test",
    "Active engineering task must survive resume.",
  );

  console.log(
    "08.21 cross-session engineering resume: SUCCESS",
  );

  const completion:
    EngineeringCompletionResult =
    {
      id:
        "completion-task-test",
      projectId:
        "project-tree-0821",
      taskId:
        "task-test",
      completed:
        true,
      reason:
        "Engineering verification passed.",
      verificationId:
        "verification-task-test",
      unmetCriteria: [],
    };

  const advanced =
    authority.acceptCompletion(
      resumed.state,
      {
        ...workflow,
        activeTaskId:
          "task-package",
        tasks:
          workflow.tasks.map(
            (task) =>
              task.id ===
                "task-test"
                ? {
                    ...task,
                    status:
                      "completed",
                  }
                : task.id ===
                    "task-package"
                  ? {
                      ...task,
                      status:
                        "ready",
                    }
                  : task,
          ),
      },
      completion,
      now,
    );

  assert(
    advanced.completedTaskIds.includes(
      "task-test",
    ),
    "Verified engineering completion must survive continuity.",
  );

  assert(
    advanced.readyTaskIds.includes(
      "task-package",
    ),
    "Verified completion must expose the next ready engineering task.",
  );

  console.log(
    "08.21 verified engineering advancement: SUCCESS",
  );

  const rejectedCompletion:
    EngineeringCompletionResult =
    {
      ...completion,
      id:
        "completion-task-test-rejected",
      completed:
        false,
      unmetCriteria: [
        "Tests must pass.",
      ],
    };

  let rejected =
    false;

  try {
    authority.acceptCompletion(
      advanced,
      workflow,
      rejectedCompletion,
      now,
    );
  } catch {
    rejected =
      true;
  }

  assert(
    rejected,
    "Unverified engineering work must never advance continuity.",
  );

  console.log(
    "08.21 unverified completion protection: SUCCESS",
  );

  let mismatch =
    false;

  try {
    authority.resume(
      resumed.state,
      {
        ...workflow,
        id:
          "different-workflow",
      },
      now,
    );
  } catch {
    mismatch =
      true;
  }

  assert(
    mismatch,
    "Cross-workflow resume must be rejected.",
  );

  console.log(
    "08.21 workflow identity protection: SUCCESS",
  );

  console.log(
    "TREE-08.21 END-TO-END ENGINEERING CONTINUITY: SUCCESS",
  );
}

main();
