import type {
  EngineeringRepairEdit,
} from "./engineering-repair-editor";

import {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import {
  EngineeringRepairExecutionAuthority,
  type EngineeringRepairExecutionResult,
} from "./engineering-repair-execution";

import type {
  EngineeringRepairStep,
} from "./engineering-repair-planner";

import {
  ControlledFileEditor,
  type FileEditorPolicy,
} from "./file-editor";

import {
  LocalEngineeringExecutionRunner,
  type LocalEngineeringExecutionReport,
} from "./local-engineering-execution-runner";

import {
  LocalProjectEngineeringReadinessAuthority,
  type LocalProjectEngineeringReadinessResult,
} from "./local-project-engineering-readiness";

import type {
  LocalEngineeringRecoveryResult,
} from "./local-engineering-recovery-bridge";

export interface LocalEngineeringRepairRetestRequest {
  initialReadiness: LocalProjectEngineeringReadinessResult;
  failureReport: LocalEngineeringExecutionReport;
  recovery: LocalEngineeringRecoveryResult;
  edit?: EngineeringRepairEdit;
  filePolicy: FileEditorPolicy;
  timeoutMs?: number;
  completedAt?: string;
}

export interface LocalEngineeringRepairRetestResult {
  repairExecution: EngineeringRepairExecutionResult;
  verification?: LocalEngineeringExecutionReport;
  verified: boolean;
}

/**
 * Executes an already-authorized recovery plan against a real local repository.
 *
 * This class does not decide whether repair is allowed. That policy decision is
 * owned by LocalEngineeringRecoveryBridge -> EngineeringFailureRecoveryAuthority
 * -> EngineeringRepairPlannerAuthority. This boundary only executes the plan.
 *
 * A repair is never considered verified from the previously failed command alone.
 * After any edit, K.I.N.G.S. re-inspects the repository and re-runs the complete
 * original verified operation set from the beginning. This prevents stale build
 * artifacts from creating a false "repaired" result.
 */
export class LocalEngineeringRepairRetestAuthority {
  async execute(
    request: LocalEngineeringRepairRetestRequest,
  ): Promise<LocalEngineeringRepairRetestResult> {
    validateRequest(request);

    const completedAt = normalizeTimestamp(
      request.completedAt ?? new Date().toISOString(),
    );
    const plan = request.recovery.repairPlan;
    const editor = new EngineeringRepairEditor(
      new ControlledFileEditor(request.filePolicy),
    );
    const executionAuthority = new EngineeringRepairExecutionAuthority();
    let verification: LocalEngineeringExecutionReport | undefined;

    const repairExecution = await executionAuthority.execute(
      plan,
      {
        execute: async (
          step: EngineeringRepairStep,
        ): Promise<{ success: boolean; output: string }> => {
          if (step.strategy === "inspect") {
            if (!request.recovery.diagnosticText.trim()) {
              return {
                success: false,
                output: "Verified local engineering failure diagnostics are required before recovery can advance.",
              };
            }
            return {
              success: true,
              output:
                `Inspected repository-native failure evidence for ${request.failureReport.failedStepId ?? request.failureReport.execution.id}.`,
            };
          }

          if (step.strategy === "edit") {
            if (!request.edit) {
              return {
                success: false,
                output: "The authorized repair plan requires a governed edit, but no edit instruction was supplied.",
              };
            }
            try {
              const result = await editor.execute(step, request.edit);
              return {
                success: result.success,
                output: result.output,
              };
            } catch (error) {
              return {
                success: false,
                output: error instanceof Error ? error.message : String(error),
              };
            }
          }

          if (step.strategy === "retest") {
            try {
              const initial = request.initialReadiness;
              const freshReadiness =
                await new LocalProjectEngineeringReadinessAuthority().inspect({
                  id: initial.execution.projectId,
                  projectPath: initial.profile.projectPath,
                  requiredOperations: [...initial.profile.requiredOperations],
                  executionId: `${initial.execution.id}-repair-retest`,
                });

              verification = new LocalEngineeringExecutionRunner().execute({
                readiness: freshReadiness,
                authorized: true,
                ...(request.timeoutMs === undefined
                  ? {}
                  : { timeoutMs: request.timeoutMs }),
              });

              if (verification.status !== "completed") {
                return {
                  success: false,
                  output: verificationFailureOutput(verification),
                };
              }

              return {
                success: true,
                output: verificationSuccessOutput(verification),
              };
            } catch (error) {
              return {
                success: false,
                output: error instanceof Error ? error.message : String(error),
              };
            }
          }

          return {
            success: false,
            output:
              `Repository-native repair execution does not authorize strategy "${step.strategy}".`,
          };
        },
      },
      completedAt,
    );

    return {
      repairExecution,
      ...(verification ? { verification } : {}),
      verified:
        repairExecution.verified &&
        verification?.status === "completed",
    };
  }
}

function validateRequest(
  request: LocalEngineeringRepairRetestRequest,
): void {
  const projectId = request.initialReadiness.execution.projectId;
  const plan = request.recovery.repairPlan;

  if (request.failureReport.execution.id !== request.initialReadiness.execution.id) {
    throw new Error(
      "K.I.N.G.S. Local Repair/Retest: failure report is not bound to the supplied readiness execution",
    );
  }

  const projectIds = [
    request.failureReport.execution.projectId,
    request.recovery.commandResult.projectId,
    request.recovery.analysis.projectId,
    plan.projectId,
  ];
  if (projectIds.some((candidate) => candidate !== projectId)) {
    throw new Error(
      "K.I.N.G.S. Local Repair/Retest: project identity diverged across readiness, failure evidence, recovery analysis, and repair plan",
    );
  }

  if (request.recovery.analysis.id !== plan.failureAnalysisId) {
    throw new Error(
      "K.I.N.G.S. Local Repair/Retest: repair plan is not bound to the supplied recovery analysis",
    );
  }

  if (request.failureReport.status !== "failed") {
    throw new Error(
      `K.I.N.G.S. Local Repair/Retest: recovery requires a failed local execution report, received "${request.failureReport.status}"`,
    );
  }

  if (
    request.failureReport.failedStepId &&
    request.recovery.commandResult.commandId !== request.failureReport.failedStepId
  ) {
    throw new Error(
      "K.I.N.G.S. Local Repair/Retest: recovery command result does not identify the failed repository step",
    );
  }

  const editStep = plan.steps.find((step) => step.strategy === "edit");
  if (editStep) {
    if (!request.edit) {
      throw new Error(
        "K.I.N.G.S. Local Repair/Retest: authorized repair plan requires a governed edit instruction",
      );
    }
    if (
      request.edit.stepId !== editStep.id ||
      request.edit.projectId !== projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Local Repair/Retest: edit instruction is not bound to the authorized repair step and project",
      );
    }
  } else if (request.edit) {
    throw new Error(
      "K.I.N.G.S. Local Repair/Retest: this recovery plan does not authorize source editing",
    );
  }

  if (!plan.steps.some((step) => step.strategy === "retest")) {
    throw new Error(
      "K.I.N.G.S. Local Repair/Retest: recovery plan has no verification step",
    );
  }

  if (!request.recovery.diagnosticText.trim()) {
    throw new Error(
      "K.I.N.G.S. Local Repair/Retest: recovery diagnostics are required",
    );
  }
}

function verificationSuccessOutput(
  report: LocalEngineeringExecutionReport,
): string {
  return [
    "Full repository verification succeeded after recovery.",
    ...report.evidence.map((entry) =>
      `${entry.sequence}. ${entry.operation}: exit ${String(entry.exitCode)} (${entry.durationMs} ms)`,
    ),
  ].join("\n");
}

function verificationFailureOutput(
  report: LocalEngineeringExecutionReport,
): string {
  const failed = report.failedStepId
    ? report.evidence.find((entry) => entry.executionStepId === report.failedStepId)
    : report.evidence.at(-1);
  return [
    "Full repository verification failed after recovery.",
    report.failureReason ?? "Verification did not complete.",
    failed ? `Failed operation: ${failed.operation}` : "",
    failed ? `Exit code: ${String(failed.exitCode)}` : "",
    failed?.stdout ? `STDOUT:\n${failed.stdout}` : "",
    failed?.stderr ? `STDERR:\n${failed.stderr}` : "",
    failed?.error ? `PROCESS ERROR:\n${failed.error}` : "",
  ].filter(Boolean).join("\n");
}

function normalizeTimestamp(
  value: string,
): string {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(
      "K.I.N.G.S. Local Repair/Retest: completedAt must be a valid timestamp",
    );
  }
  return new Date(value).toISOString();
}
