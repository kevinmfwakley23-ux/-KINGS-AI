import {
  EngineeringFailureRecoveryBridge,
} from "./engineering-failure-recovery-bridge";

import type {
  EngineeringExecutionPipelineResult,
} from "./engineering-execution-pipeline";

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

function failedPipeline():
  EngineeringExecutionPipelineResult {
  return {
    id:
      "pipeline-tree-0834",
    realExecution:
      true,
    step: {
      id:
        "step-execution-tree-0834",
      projectId:
        "project-tree-0834",
      executionId:
        "execution-tree-0834",
      stepId:
        "step-tree-0834",
      started:
        true,
      completed:
        false,
      exitCode:
        7,
      stdout:
        "build started",
      stderr:
        "compile failure",
      evidence: [
        "status:failed",
      ],
    },
    execution: {
      executionId:
        "execution-tree-0834",
      status:
        "failed",
      attempts: [
        {
          id:
            "attempt-tree-0834",
          command: {
            id:
              "command-tree-0834",
            projectId:
              "project-tree-0834",
            executionStepId:
              "step-tree-0834",
            language:
              "typescript",
            operation:
              "build",
            executable:
              "tsc",
            args: [],
            workingDirectory:
              "/tmp/kings-tree-0834",
            authorized:
              true,
          },
          attemptNumber:
            1,
          result: {
            id:
              "result-tree-0834",
            commandId:
              "command-tree-0834",
            projectId:
              "project-tree-0834",
            status:
              "failed",
            exitCode:
              7,
            stdout:
              "build started",
            stderr:
              "compile failure",
            durationMs:
              12,
            completedAt:
              new Date().toISOString(),
          },
        },
      ],
      successfulCommandIds: [],
      failedCommandIds: [
        "command-tree-0834",
      ],
    },
  };
}

function main(): void {
  const bridge =
    new EngineeringFailureRecoveryBridge();

  const result =
    bridge.resolve({
      pipeline:
        failedPipeline(),
      attemptNumber:
        1,
      policy: {
        maxRetries:
          1,
        allowRepair:
          true,
      },
    });

  assert(
    result.analysis.action ===
      "repair",
    "Retry exhaustion must transition a real failed command into repair.",
  );

  assert(
    result.analysis.retryable ===
      false,
    "Repair transition must no longer be retryable.",
  );

  assert(
    result.analysis.diagnostics.includes(
      "compile failure",
    ),
    "Real stderr must become recovery diagnostics.",
  );

  assert(
    result.repairPlan.authorized,
    "Authorized repair policy must produce an authorized repair plan.",
  );

  assert(
    result.repairPlan.steps.some(
      (step) =>
        step.strategy ===
        "inspect",
    ),
    "Repair must begin with evidence inspection.",
  );

  assert(
    result.repairPlan.steps.some(
      (step) =>
        step.strategy ===
        "edit",
    ),
    "Repair must contain an edit step.",
  );

  assert(
    result.repairPlan.steps.some(
      (step) =>
        step.strategy ===
        "retest",
    ),
    "Repair must require retesting.",
  );

  console.log(
    "08.34 REAL FAILURE DIAGNOSTICS: SUCCESS",
  );

  console.log(
    "08.34 FAILURE TO REPAIR TRANSITION: SUCCESS",
  );

  console.log(
    "08.34 GOVERNED REPAIR PLAN: SUCCESS",
  );

  console.log(
    "TREE-08.34 REAL FAILURE RECOVERY BRIDGE: SUCCESS",
  );
}

main();
