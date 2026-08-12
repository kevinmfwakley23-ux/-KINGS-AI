import {
  EngineeringRecoveryWorkflowBridge,
} from "./engineering-recovery-workflow-bridge";

import type {
  EngineeringCompletionResult,
} from "./engineering-completion-authority";

import type {
  EngineeringRepairRetestResult,
} from "./engineering-repair-retest-bridge";

import type {
  EngineeringContinuityState,
} from "./engineering-continuity-bridge";

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

function repair(
  verified:
    boolean,
):
  EngineeringRepairRetestResult {
  return {
    id:
      "repair-retest-tree-0837",
    planId:
      "repair-plan-tree-0837",
    projectId:
      "project-tree-0837",
    status:
      verified
        ? "completed"
        : "failed",
    verified,
    stepResults: [
      {
        stepId:
          "repair-step-tree-0837-inspect",
        strategy:
          "inspect",
        status:
          verified
            ? "success"
            : "failed",
        output:
          "failure inspected",
        completedAt:
          new Date().toISOString(),
      },
      {
        stepId:
          "repair-step-tree-0837-edit",
        strategy:
          "edit",
        status:
          verified
            ? "success"
            : "failed",
        output:
          "repair applied",
        completedAt:
          new Date().toISOString(),
      },
      {
        stepId:
          "repair-step-tree-0837-retest",
        strategy:
          "retest",
        status:
          verified
            ? "success"
            : "failed",
        output:
          verified
            ? "real retest passed"
            : "real retest failed",
        completedAt:
          new Date().toISOString(),
      },
    ],
  };
}

function completion(
  completed:
    boolean,
):
  EngineeringCompletionResult {
  return {
    id:
      "completion-task-tree-0837",
    projectId:
      "project-tree-0837",
    taskId:
      "task-tree-0837",
    completed,
    reason:
      completed
        ? "Verified repair satisfies all required criteria."
        : "Verification incomplete.",
    verificationId:
      "verification-tree-0837",
    unmetCriteria:
      completed
        ? []
        : [
            "retest",
          ],
  };
}

function continuity():
  EngineeringContinuityState {
  return {
    id:
      "engineering-continuity-workflow-tree-0837",
    projectId:
      "project-tree-0837",
    workflowId:
      "workflow-tree-0837",
    activeTaskId:
      "task-tree-0837",
    completedTaskIds: [],
    readyTaskIds: [
      "task-tree-0837",
    ],
    interrupted:
      false,
    resumeCount:
      0,
    updatedAt:
      new Date().toISOString(),
  };
}

function main(): void {
  const bridge =
    new EngineeringRecoveryWorkflowBridge();

  const task:
    EngineeringWorkflowTask =
    {
      id:
        "task-tree-0837",
      projectId:
        "project-tree-0837",
      dependencyIds: [],
      status:
        "active",
    };

  const nextTask:
    EngineeringWorkflowTask =
    {
      id:
        "task-tree-0837-next",
      projectId:
        "project-tree-0837",
      dependencyIds: [
        "task-tree-0837",
      ],
      status:
        "blocked",
    };

  const result =
    bridge.advance({
      task,
      completion:
        completion(true),
      repair:
        repair(true),
      continuity:
        continuity(),
      tasks: [
        task,
        nextTask,
      ],
    });

  assert(
    result.recoveryVerified,
    "A successful real repair must be recognized as verified recovery.",
  );

  assert(
    result.workflowAdvanced,
    "Verified repaired work must return to normal workflow advancement.",
  );

  assert(
    result.continuityAccepted,
    "Verified recovery must be accepted into workflow continuity.",
  );

  assert(
    result.task.status ===
      "completed",
    "The repaired task must become completed through the normal workflow authority.",
  );

  assert(
    result.unlockedTaskIds.includes(
      "task-tree-0837-next",
    ),
    "Successful repaired completion must unlock the dependent task.",
  );

  console.log(
    "08.37 VERIFIED REPAIR TO WORKFLOW: SUCCESS",
  );

  console.log(
    "08.37 NORMAL COMPLETION AUTHORITY REUSE: SUCCESS",
  );

  console.log(
    "08.37 DEPENDENCY UNLOCK AFTER REPAIR: SUCCESS",
  );

  const blocked =
    bridge.advance({
      task,
      completion:
        completion(false),
      repair:
        repair(false),
      continuity:
        continuity(),
      tasks: [
        task,
        nextTask,
      ],
    });

  assert(
    !blocked.workflowAdvanced,
    "Unverified repair must never advance workflow.",
  );

  assert(
    !blocked.continuityAccepted,
    "Unverified repair must never enter continuity as completed work.",
  );

  console.log(
    "08.37 UNVERIFIED REPAIR BLOCKING: SUCCESS",
  );

  console.log(
    "TREE-08.37 RECOVERY TO WORKFLOW CLOSURE: SUCCESS",
  );
}

main();
