import {
  LocalEngineeringRecoveryBridge,
} from "./local-engineering-recovery-bridge";

import type {
  LocalEngineeringExecutionReport,
} from "./local-engineering-execution-runner";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function main(): void {
  routesFailedTestIntoRepairPlan();
  routesRetryableFailureIntoRetryPlan();
  preservesAuthorizationBlockWithoutInventingExecution();
  routesSuccessfulExecutionToCompletion();
  console.log("TREE-09 LOCAL ENGINEERING FAILURE -> RECOVERY BRIDGE: SUCCESS");
}

function routesFailedTestIntoRepairPlan(): void {
  const bridge = new LocalEngineeringRecoveryBridge();
  const report = failedReport();
  const result = bridge.analyze({
    report,
    attemptNumber: 1,
    policy: {
      maxRetries: 0,
      allowRepair: true,
    },
    completedAt: "2026-09-05T14:30:00Z",
  });

  assert(result.commandResult.status === "failed", "Failed local execution evidence must become a failed engineering command result.");
  assert(result.commandResult.exitCode === 7, "The exact failed process exit code must be preserved.");
  assert(result.commandResult.stderr.includes("Expected 4 but received 3"), "Raw test failure stderr must survive recovery adaptation.");
  assert(result.analysis.action === "repair", "An exhausted retry policy with repair allowed must enter repair action.");
  assert(result.repairPlan.authorized, "Repair action must compile into an authorized governed repair plan.");
  assert(
    result.repairPlan.steps.map((step) => step.strategy).join(",") === "inspect,edit,retest",
    "Repair plan must inspect evidence, make one governed edit, and retest in order.",
  );
  assert(result.repairPlan.stopAfterFailure, "Repair execution must remain stop-on-first-failure.");
  assert(result.diagnosticText.includes("Logical command: npm run test"), "Repair diagnostics must identify the logical repository command.");
  assert(result.diagnosticText.includes("Resolved command:"), "Repair diagnostics must retain the cross-platform executable evidence.");
  assert(result.diagnosticText.includes("Expected 4 but received 3"), "Repair diagnostics must include the verified failing assertion.");
  console.log("09.RECOVERY failed test -> inspect/edit/retest plan: SUCCESS");
}

function routesRetryableFailureIntoRetryPlan(): void {
  const bridge = new LocalEngineeringRecoveryBridge();
  const result = bridge.analyze({
    report: failedReport({ timedOut: true, exitCode: null, stderr: "" }),
    attemptNumber: 1,
    policy: {
      maxRetries: 3,
      allowRepair: true,
    },
    completedAt: "2026-09-05T14:31:00Z",
  });

  assert(result.analysis.action === "retry", "A first failure inside the retry budget must not jump straight to source mutation.");
  assert(result.analysis.retryable, "Retry action must be marked retryable.");
  assert(
    result.repairPlan.steps.map((step) => step.strategy).join(",") === "inspect,retest",
    "Retry plan must inspect evidence and retest without an edit step.",
  );
  assert(!result.repairPlan.steps.some((step) => step.strategy === "edit"), "Transient retry must not authorize code editing.");
  assert(result.commandResult.stderr.includes("Execution timed out."), "Timeout state must remain explicit in adapted diagnostics.");
  console.log("09.RECOVERY retry budget protects against premature edits: SUCCESS");
}

function preservesAuthorizationBlockWithoutInventingExecution(): void {
  const bridge = new LocalEngineeringRecoveryBridge();
  const report: LocalEngineeringExecutionReport = {
    status: "blocked",
    execution: {
      id: "blocked-execution",
      projectId: "blocked-project",
      status: "blocked",
      steps: [],
      completedStepIds: [],
      blockedReasons: ["Governed execution authorization is required."],
    },
    evidence: [],
    failureReason: "Governed execution authorization is required before commands may run.",
  };
  const result = bridge.analyze({
    report,
    attemptNumber: 1,
    policy: {
      maxRetries: 2,
      allowRepair: true,
    },
  });

  assert(result.commandResult.status === "blocked", "Authorization boundary must remain blocked after adaptation.");
  assert(result.commandResult.exitCode === -1, "Blocked execution must not fabricate a real process exit code.");
  assert(result.analysis.action === "blocked", "Blocked command must use existing failure-recovery authorization semantics.");
  assert(!result.repairPlan.authorized, "Blocked execution must not silently authorize a repair plan.");
  assert(
    result.repairPlan.steps.length === 1 &&
      result.repairPlan.steps[0].strategy === "escalate",
    "Blocked execution must escalate for explicit authorization instead of editing or retrying.",
  );
  console.log("09.RECOVERY authorization block remains fail-closed: SUCCESS");
}

function routesSuccessfulExecutionToCompletion(): void {
  const bridge = new LocalEngineeringRecoveryBridge();
  const report = failedReport({
    reportStatus: "completed",
    executionStatus: "completed",
    succeeded: true,
    exitCode: 0,
    stdout: "all tests passed\n",
    stderr: "",
    failureReason: undefined,
  });
  const result = bridge.analyze({
    report,
    attemptNumber: 1,
    policy: {
      maxRetries: 1,
      allowRepair: true,
    },
  });

  assert(result.commandResult.status === "success", "Completed local execution must adapt to successful command evidence.");
  assert(result.analysis.action === "complete", "Successful execution must terminate recovery planning.");
  assert(!result.repairPlan.authorized && result.repairPlan.steps.length === 0, "No repair work may be created after successful verification.");
  console.log("09.RECOVERY successful verification terminates recovery: SUCCESS");
}

interface FailureOverrides {
  reportStatus?: "completed" | "failed";
  executionStatus?: "completed" | "failed";
  timedOut?: boolean;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  succeeded?: boolean;
  failureReason?: string | undefined;
}

function failedReport(
  overrides: FailureOverrides = {},
): LocalEngineeringExecutionReport {
  const stepId = "engineering-failure-execution-step-2";
  const reportStatus = overrides.reportStatus ?? "failed";
  const executionStatus = overrides.executionStatus ?? "failed";
  const timedOut = overrides.timedOut ?? false;
  const exitCode = overrides.exitCode === undefined ? 7 : overrides.exitCode;
  const succeeded = overrides.succeeded ?? false;
  const failureReason = Object.prototype.hasOwnProperty.call(overrides, "failureReason")
    ? overrides.failureReason
    : "Engineering test step exited with code 7.";

  return {
    status: reportStatus,
    execution: {
      id: "engineering-failure-execution",
      projectId: "engineering-failure-project",
      status: executionStatus,
      steps: [
        {
          id: "engineering-failure-execution-step-1",
          language: "javascript",
          operation: "build",
          capabilityId: "engineering-javascript",
          sequence: 1,
        },
        {
          id: stepId,
          language: "javascript",
          operation: "test",
          capabilityId: "engineering-javascript",
          sequence: 2,
        },
      ],
      ...(executionStatus === "completed" ? {} : { currentStepId: stepId }),
      completedStepIds: executionStatus === "completed"
        ? ["engineering-failure-execution-step-1", stepId]
        : ["engineering-failure-execution-step-1"],
      blockedReasons: [],
    },
    evidence: [
      {
        executionStepId: stepId,
        sequence: 2,
        language: "javascript",
        operation: "test",
        command: "npm",
        args: ["run", "test"],
        resolvedExecutable: process.platform === "win32" ? process.execPath : "npm",
        resolvedArgs: process.platform === "win32" ? ["npm-cli.js", "run", "test"] : ["run", "test"],
        started: true,
        exitCode,
        succeeded,
        timedOut,
        durationMs: 84,
        stdout: overrides.stdout ?? "",
        stderr: overrides.stderr ?? "AssertionError: Expected 4 but received 3\n",
        stdoutTruncated: false,
        stderrTruncated: false,
      },
    ],
    ...(reportStatus === "failed" ? { failedStepId: stepId } : {}),
    ...(failureReason ? { failureReason } : {}),
  };
}

main();