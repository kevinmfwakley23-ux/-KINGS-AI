import type {
  ID,
} from "./types";

import type {
  BuildTestExecutionResult,
} from "./build-test-executor";

import {
  FailureEscalationAuthority,
  type WorkerFailureKind,
  type FailureEscalationResult,
} from "./failure-escalation";

export type EngineeringFailureSource =
  | "build"
  | "test"
  | "lint"
  | "validation"
  | "timeout"
  | "authorization"
  | "budget"
  | "unknown";

export interface FailureDiagnosisInput {
  taskId:
    ID;
  workUnitId:
    ID;
  attempt:
    number;
  execution:
    BuildTestExecutionResult;
  additionalDetails?:
    string[];
  evidenceIds?:
    ID[];
  priorFailureIds?:
    ID[];
}

export interface FailureDiagnosisRecord {
  id:
    ID;
  taskId:
    ID;
  workUnitId:
    ID;
  attempt:
    number;
  source:
    EngineeringFailureSource;
  kind:
    WorkerFailureKind;
  summary:
    string;
  rootCauseCandidates:
    string[];
  repairRecommendation:
    string;
  changedStrategyRequired:
    boolean;
  evidenceIds:
    ID[];
  createdAt:
    string;
}

export interface FailureDiagnosisResult {
  diagnosis:
    FailureDiagnosisRecord;
  escalation:
    FailureEscalationResult;
}

export class FailureDiagnosisAuthority {
  constructor(
    private readonly escalation:
      FailureEscalationAuthority =
      new FailureEscalationAuthority(),
  ) {}

  diagnose(
    input:
      FailureDiagnosisInput,
  ): FailureDiagnosisResult {
    if (
      !input.taskId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Failure Diagnosis: task id is required",
      );
    }

    if (
      !input.workUnitId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Failure Diagnosis: work unit id is required",
      );
    }

    if (
      input.attempt < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Failure Diagnosis: attempt must be positive",
      );
    }

    const failedStep =
      input.execution.steps.find(
        (step) =>
          !step.passed,
      );

    const source =
      this.classifySource(
        failedStep,
      );

    const kind =
      this.classifyFailure(
        source,
        failedStep,
      );

    const details =
      failedStep
        ? [
            `Command: ${failedStep.step.command}`,
            `Arguments: ${failedStep.step.args.join(" ")}`,
            `Exit code: ${String(failedStep.execution.exitCode)}`,
            `Signal: ${String(failedStep.execution.signal)}`,
            `Timed out: ${String(failedStep.execution.timedOut)}`,
            `STDOUT: ${failedStep.execution.stdout}`,
            `STDERR: ${failedStep.execution.stderr}`,
            ...(input.additionalDetails ??
              []),
          ]
        : [
            ...(input.additionalDetails ??
              []),
          ];

    const rootCauseCandidates =
      this.findRootCauses(
        source,
        failedStep,
      );

    const repairRecommendation =
      this.recommendRepair(
        source,
        kind,
        failedStep,
      );

    const changedStrategyRequired =
      kind ===
        "verification-failed" ||
      kind ===
        "unknown";

    const escalation =
      this.escalation.evaluate(
        {
          taskId:
            input.taskId,
          workUnitId:
            input.workUnitId,
          kind,
          summary:
            failedStep
              ? `Build/test failure in step "${failedStep.step.id}".`
              : `Build/test execution failed for task "${input.taskId}".`,
          details,
          attempt:
            input.attempt,
          evidenceIds:
            input.evidenceIds ??
            [],
          priorFailureIds:
            input.priorFailureIds ??
            [],
        },
      );

    const diagnosis:
      FailureDiagnosisRecord =
      {
        id:
          `diagnosis-${input.taskId}-${input.attempt}-${Date.now()}`,
        taskId:
          input.taskId,
        workUnitId:
          input.workUnitId,
        attempt:
          input.attempt,
        source,
        kind,
        summary:
          failedStep
            ? `Failure diagnosed from step "${failedStep.step.id}".`
            : `Failure diagnosed for task "${input.taskId}".`,
        rootCauseCandidates,
        repairRecommendation,
        changedStrategyRequired,
        evidenceIds: [
          ...(input.evidenceIds ??
            []),
        ],
        createdAt:
          new Date().toISOString(),
      };

    return {
      diagnosis,
      escalation,
    };
  }

  private classifySource(
    step:
      FailureDiagnosisInput["execution"]["steps"][number] |
      undefined,
  ): EngineeringFailureSource {
    if (!step) {
      return "unknown";
    }

    if (
      step.execution.timedOut
    ) {
      return "timeout";
    }

    switch (step.step.operation) {
      case "build":
        return "build";
      case "test":
        return "test";
      case "lint":
        return "lint";
      case "validate":
        return "validation";
      default:
        return "unknown";
    }
  }

  private classifyFailure(
    source:
      EngineeringFailureSource,
    step:
      FailureDiagnosisInput["execution"]["steps"][number] |
      undefined,
  ): WorkerFailureKind {
    if (
      source ===
      "authorization"
    ) {
      return "authorization-failed";
    }

    if (
      source ===
      "budget"
    ) {
      return "budget-exhausted";
    }

    if (
      step?.execution.timedOut
    ) {
      return "transient-execution";
    }

    if (
      source ===
        "test" ||
      source ===
        "validation" ||
      source ===
        "lint"
    ) {
      return "verification-failed";
    }

    if (
      source ===
      "build"
    ) {
      return "unknown";
    }

    return "unknown";
  }

  private findRootCauses(
    source:
      EngineeringFailureSource,
    step:
      FailureDiagnosisInput["execution"]["steps"][number] |
      undefined,
  ): string[] {
    if (!step) {
      return [
        "No individual failed step was returned; inspect the execution boundary and preserved evidence.",
      ];
    }

    const stderr =
      step.execution.stderr
        .trim();

    const stdout =
      step.execution.stdout
        .trim();

    const causes:
      string[] =
      [];

    if (
      step.execution.timedOut
    ) {
      causes.push(
        "Execution exceeded the authorized timeout.",
      );
    }

    if (
      step.execution.exitCode !==
        0 &&
      stderr
    ) {
      causes.push(
        `Process reported an error: ${stderr.slice(0, 500)}`,
      );
    }

    if (
      step.execution.exitCode ===
        null &&
      step.execution.signal
    ) {
      causes.push(
        `Process terminated by signal ${step.execution.signal}.`,
      );
    }

    if (
      step.execution.exitCode !==
        0 &&
      stdout
    ) {
      causes.push(
        `Process output indicates failure context: ${stdout.slice(0, 500)}`,
      );
    }

    if (
      source ===
      "test"
    ) {
      causes.push(
        "One or more automated tests did not satisfy the expected behavior.",
      );
    }

    if (
      source ===
      "build"
    ) {
      causes.push(
        "The repository could not be compiled or built successfully.",
      );
    }

    if (
      causes.length ===
      0
    ) {
      causes.push(
        "The available execution evidence is insufficient to identify a more specific cause.",
      );
    }

    return causes;
  }

  private recommendRepair(
    source:
      EngineeringFailureSource,
    kind:
      WorkerFailureKind,
    step:
      FailureDiagnosisInput["execution"]["steps"][number] |
      undefined,
  ): string {
    if (
      kind ===
      "authorization-failed"
    ) {
      return "Stop execution and correct the governing Work Unit authorization before retrying.";
    }

    if (
      kind ===
      "budget-exhausted"
    ) {
      return "Preserve the current evidence and create a new bounded Work Unit only after an explicit budget decision.";
    }

    if (
      kind ===
      "verification-failed"
    ) {
      return `Inspect the failed ${source} evidence, identify the violated expectation, make a materially different correction, then rerun the failed verification.`;
    }

    if (
      kind ===
      "transient-execution"
    ) {
      return "Determine whether the failure is environmental or transient; only then consider the bounded retry policy.";
    }

    if (
      step
    ) {
      return `Inspect the command, arguments, output, and repository state associated with step "${step.step.id}" before creating a repair work unit.`;
    }

    return "Preserve evidence, diagnose the execution boundary, and create a bounded repair work unit only after the cause is understood.";
  }
}
