import type {
  EngineeringCommandResult,
} from "./engineering-execution-loop";

import {
  EngineeringFailureRecoveryAuthority,
  type EngineeringFailureAnalysis,
  type EngineeringFailureRecoveryPolicy,
} from "./engineering-failure-recovery";

import {
  EngineeringRepairPlannerAuthority,
  type EngineeringRepairPlan,
} from "./engineering-repair-planner";

import type {
  LocalEngineeringExecutionReport,
  LocalEngineeringStepEvidence,
} from "./local-engineering-execution-runner";

export interface LocalEngineeringRecoveryRequest {
  report: LocalEngineeringExecutionReport;
  attemptNumber: number;
  policy: EngineeringFailureRecoveryPolicy;
  completedAt?: string;
}

export interface LocalEngineeringRecoveryResult {
  commandResult: EngineeringCommandResult;
  analysis: EngineeringFailureAnalysis;
  repairPlan: EngineeringRepairPlan;
  diagnosticText: string;
}

/**
 * Converts repository-native local execution evidence into the existing K.I.N.G.S.
 * failure-recovery and repair-planning authorities. This is deliberately an
 * adapter: it does not invent a second retry/repair policy or auto-author a code
 * edit. The resulting plan must still pass the controlled editor/retest boundary.
 */
export class LocalEngineeringRecoveryBridge {
  private readonly recovery =
    new EngineeringFailureRecoveryAuthority();
  private readonly planner =
    new EngineeringRepairPlannerAuthority();

  analyze(
    request: LocalEngineeringRecoveryRequest,
  ): LocalEngineeringRecoveryResult {
    if (!Number.isInteger(request.attemptNumber) || request.attemptNumber < 1) {
      throw new Error(
        "K.I.N.G.S. Local Engineering Recovery: attempt number must be a positive integer",
      );
    }

    const completedAt = normalizeTimestamp(
      request.completedAt ?? new Date().toISOString(),
    );
    const evidence = relevantEvidence(request.report);
    const commandResult = toCommandResult(
      request.report,
      evidence,
      request.attemptNumber,
      completedAt,
    );
    const analysis = this.recovery.analyze(
      commandResult,
      request.attemptNumber,
      request.policy,
    );
    const repairPlan = this.planner.plan(analysis);

    return {
      commandResult,
      analysis,
      repairPlan,
      diagnosticText: diagnosticText(
        request.report,
        evidence,
        analysis,
      ),
    };
  }
}

function relevantEvidence(
  report: LocalEngineeringExecutionReport,
): LocalEngineeringStepEvidence | undefined {
  if (report.failedStepId) {
    return report.evidence.find(
      (entry) => entry.executionStepId === report.failedStepId,
    );
  }
  return report.evidence.at(-1);
}

function toCommandResult(
  report: LocalEngineeringExecutionReport,
  evidence: LocalEngineeringStepEvidence | undefined,
  attemptNumber: number,
  completedAt: string,
): EngineeringCommandResult {
  const projectId = requiredId(
    report.execution.projectId,
    "project id",
  );
  const stepId = evidence?.executionStepId ??
    report.failedStepId ??
    `${report.execution.id}-boundary`;
  const status: EngineeringCommandResult["status"] =
    report.status === "completed"
      ? "success"
      : report.status === "blocked"
        ? "blocked"
        : "failed";
  const stderr = [
    evidence?.stderr ?? "",
    evidence?.error ?? "",
    evidence?.timedOut ? "Execution timed out." : "",
    report.failureReason ?? "",
  ].filter(Boolean).join("\n");

  return {
    id: `local-result-${sanitizeId(stepId)}-${attemptNumber}`,
    commandId: requiredId(stepId, "execution step id"),
    projectId,
    status,
    exitCode: evidence?.exitCode ?? (status === "success" ? 0 : -1),
    stdout: evidence?.stdout ?? "",
    stderr,
    durationMs: evidence?.durationMs ?? 0,
    completedAt,
  };
}

function diagnosticText(
  report: LocalEngineeringExecutionReport,
  evidence: LocalEngineeringStepEvidence | undefined,
  analysis: EngineeringFailureAnalysis,
): string {
  const lines: string[] = [
    `Execution: ${report.execution.id}`,
    `Project: ${report.execution.projectId}`,
    `Status: ${report.status}`,
  ];

  if (evidence) {
    lines.push(
      `Step: ${evidence.executionStepId}`,
      `Operation: ${evidence.operation}`,
      `Logical command: ${renderCommand(evidence.command, evidence.args)}`,
      `Resolved command: ${renderCommand(evidence.resolvedExecutable, evidence.resolvedArgs)}`,
      `Started: ${String(evidence.started)}`,
      `Exit code: ${String(evidence.exitCode)}`,
      `Timed out: ${String(evidence.timedOut)}`,
      `Duration ms: ${String(evidence.durationMs)}`,
    );
    if (evidence.signal) lines.push(`Signal: ${evidence.signal}`);
    if (evidence.stdout) lines.push(`STDOUT:\n${evidence.stdout}`);
    if (evidence.stderr) lines.push(`STDERR:\n${evidence.stderr}`);
    if (evidence.error) lines.push(`PROCESS ERROR:\n${evidence.error}`);
  }

  if (report.failureReason) {
    lines.push(`Execution failure reason: ${report.failureReason}`);
  }
  lines.push(
    `Recovery action: ${analysis.action}`,
    `Recovery reason: ${analysis.reason}`,
  );
  if (analysis.diagnostics.length) {
    lines.push(`Recovery diagnostics:\n${analysis.diagnostics.join("\n")}`);
  }

  return lines.join("\n\n");
}

function renderCommand(
  executable: string,
  args: readonly string[],
): string {
  return [executable, ...args.map(quoteArgument)].join(" ");
}

function quoteArgument(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/u.test(value)) return value;
  return JSON.stringify(value);
}

function requiredId(
  value: string,
  label: string,
): string {
  if (!value.trim()) {
    throw new Error(
      `K.I.N.G.S. Local Engineering Recovery: ${label} is required`,
    );
  }
  return value;
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/gu, "-");
}

function normalizeTimestamp(value: string): string {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(
      "K.I.N.G.S. Local Engineering Recovery: completedAt must be a valid timestamp",
    );
  }
  return new Date(value).toISOString();
}