import {
  spawnSync,
} from "node:child_process";

import type {
  EngineeringLanguage,
  ToolchainCommand,
  ToolchainOperation,
} from "./engineering-toolchain";

import {
  AutonomousEngineeringExecutionAuthority,
  type AutonomousEngineeringExecution,
  type EngineeringExecutionStep,
} from "./autonomous-engineering-execution";

import type {
  LocalProjectEngineeringReadinessResult,
} from "./local-project-engineering-readiness";

import {
  safeToolchainInvocation,
} from "./safe-toolchain-invocation";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const PROCESS_MAX_BUFFER_BYTES = 1024 * 1024;
const EVIDENCE_OUTPUT_LIMIT = 64 * 1024;

const EXECUTABLE_OPERATIONS = new Set<ToolchainOperation>([
  "lint",
  "typecheck",
  "compile",
  "build",
  "test",
]);

export interface LocalEngineeringProcessResult {
  started: boolean;
  status: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error?: string;
  resolvedExecutable: string;
  resolvedArgs: string[];
}

export interface LocalEngineeringProcessRunner {
  run(
    executable: string,
    args: readonly string[],
    workingDirectory: string,
    timeoutMs: number,
  ): LocalEngineeringProcessResult;
}

export class NodeLocalEngineeringProcessRunner
  implements LocalEngineeringProcessRunner {
  run(
    executable: string,
    args: readonly string[],
    workingDirectory: string,
    timeoutMs: number,
  ): LocalEngineeringProcessResult {
    const invocation = safeToolchainInvocation(executable, args);
    const result = spawnSync(invocation.executable, invocation.args, {
      cwd: workingDirectory,
      encoding: "utf8",
      shell: false,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: PROCESS_MAX_BUFFER_BYTES,
    });
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code;

    return {
      started: typeof result.pid === "number" && result.pid > 0,
      status: result.status,
      ...(result.signal ? { signal: String(result.signal) } : {}),
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      timedOut: code === "ETIMEDOUT",
      ...(result.error ? { error: result.error.message } : {}),
      resolvedExecutable: invocation.executable,
      resolvedArgs: [...invocation.args],
    };
  }
}

export interface LocalEngineeringStepEvidence {
  executionStepId: string;
  sequence: number;
  language: EngineeringLanguage;
  operation: ToolchainOperation;
  command: string;
  args: string[];
  resolvedExecutable: string;
  resolvedArgs: string[];
  started: boolean;
  exitCode: number | null;
  signal?: string;
  succeeded: boolean;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  error?: string;
}

export interface LocalEngineeringExecutionReport {
  status: "blocked" | "completed" | "failed";
  execution: AutonomousEngineeringExecution;
  evidence: LocalEngineeringStepEvidence[];
  failedStepId?: string;
  failureReason?: string;
}

export interface ExecuteLocalEngineeringRequest {
  readiness: LocalProjectEngineeringReadinessResult;
  authorized: boolean;
  timeoutMs?: number;
}

interface ResolvedExecutionStep {
  step: EngineeringExecutionStep;
  command: ToolchainCommand;
}

/**
 * Executes only commands that have already passed repository-derived readiness
 * verification. No shell is used, no dependency installation is attempted, and
 * every step runs in governed sequence. The runner stops on the first failure
 * and retains bounded stdout/stderr evidence for the later diagnosis/repair loop.
 */
export class LocalEngineeringExecutionRunner {
  private readonly executionAuthority =
    new AutonomousEngineeringExecutionAuthority();

  constructor(
    private readonly processRunner: LocalEngineeringProcessRunner =
      new NodeLocalEngineeringProcessRunner(),
  ) {}

  execute(
    request: ExecuteLocalEngineeringRequest,
  ): LocalEngineeringExecutionReport {
    if (request.authorized !== true) {
      return blockedReport(
        request.readiness.execution,
        "Governed execution authorization is required before K.I.N.G.S. may run repository build or test commands.",
      );
    }

    const timeoutMs = normalizeTimeout(request.timeoutMs);
    const readiness = request.readiness;

    if (
      readiness.profile.projectPath !== readiness.environment.projectPath
    ) {
      return blockedReport(
        readiness.execution,
        "Readiness project-path evidence is inconsistent; local execution is blocked.",
      );
    }

    if (readiness.execution.status === "blocked") {
      return {
        status: "blocked",
        execution: cloneExecution(readiness.execution),
        evidence: [],
        failureReason: readiness.execution.blockedReasons.join(" ") ||
          "Repository readiness is blocked.",
      };
    }

    if (readiness.execution.status === "completed") {
      return {
        status: "completed",
        execution: cloneExecution(readiness.execution),
        evidence: [],
      };
    }

    if (readiness.execution.status !== "ready") {
      return {
        status: "failed",
        execution: {
          ...cloneExecution(readiness.execution),
          status: "failed",
        },
        evidence: [],
        failureReason:
          `Execution entered unsupported starting state "${readiness.execution.status}".`,
      };
    }

    const resolved = resolveExecutionSteps(readiness);
    if ("blockedReason" in resolved) {
      return blockedReport(readiness.execution, resolved.blockedReason);
    }

    let execution = cloneExecution(readiness.execution);
    const evidence: LocalEngineeringStepEvidence[] = [];

    for (const item of resolved.steps) {
      if (execution.currentStepId !== item.step.id) {
        return {
          status: "failed",
          execution: { ...execution, status: "failed" },
          evidence,
          failedStepId: item.step.id,
          failureReason:
            "Governed execution sequence diverged from the verified engineering plan.",
        };
      }

      const startedAt = Date.now();
      const result = this.processRunner.run(
        item.command.command,
        item.command.args,
        readiness.profile.projectPath,
        timeoutMs,
      );
      const durationMs = Math.max(0, Date.now() - startedAt);
      const stdout = boundedOutput(result.stdout);
      const stderr = boundedOutput(result.stderr);
      const succeeded =
        result.started &&
        !result.timedOut &&
        result.status === 0 &&
        result.error === undefined;

      evidence.push({
        executionStepId: item.step.id,
        sequence: item.step.sequence,
        language: item.step.language,
        operation: item.step.operation,
        command: item.command.command,
        args: [...item.command.args],
        resolvedExecutable: result.resolvedExecutable,
        resolvedArgs: [...result.resolvedArgs],
        started: result.started,
        exitCode: result.status,
        ...(result.signal ? { signal: result.signal } : {}),
        succeeded,
        timedOut: result.timedOut,
        durationMs,
        stdout: stdout.text,
        stderr: stderr.text,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        ...(result.error ? { error: result.error } : {}),
      });

      if (!succeeded) {
        const failureReason = executionFailureReason(
          item.step,
          result,
        );
        execution = {
          ...execution,
          status: "failed",
          steps: execution.steps.map((step) => ({ ...step })),
          completedStepIds: [...execution.completedStepIds],
          blockedReasons: [...execution.blockedReasons],
        };
        return {
          status: "failed",
          execution,
          evidence,
          failedStepId: item.step.id,
          failureReason,
        };
      }

      execution = this.executionAuthority.completeStep(
        execution,
        item.step.id,
      );
    }

    return {
      status: execution.status === "completed" ? "completed" : "failed",
      execution,
      evidence,
      ...(execution.status === "completed"
        ? {}
        : {
          failureReason:
            "Verified engineering commands ended without completing the governed execution plan.",
        }),
    };
  }
}

function resolveExecutionSteps(
  readiness: LocalProjectEngineeringReadinessResult,
):
  | { steps: ResolvedExecutionStep[] }
  | { blockedReason: string } {
  const resolved: ResolvedExecutionStep[] = [];

  for (const step of readiness.execution.steps) {
    if (!EXECUTABLE_OPERATIONS.has(step.operation)) {
      return {
        blockedReason:
          `Operation "${step.operation}" is outside the governed local validation/build execution boundary.`,
      };
    }

    const verification = readiness.profile.verifiedToolchains.find(
      (candidate) =>
        candidate.language === step.language &&
        candidate.verified,
    );
    if (!verification) {
      return {
        blockedReason:
          `No verified toolchain evidence is available for execution language "${step.language}".`,
      };
    }

    const command = verification.toolchain.commands.find(
      (candidate) => candidate.operation === step.operation,
    );
    if (!command) {
      return {
        blockedReason:
          `Verified toolchain "${verification.toolchain.id}" has no command for operation "${step.operation}".`,
      };
    }

    resolved.push({
      step,
      command: {
        ...command,
        args: [...command.args],
      },
    });
  }

  return { steps: resolved };
}

function blockedReport(
  execution: AutonomousEngineeringExecution,
  reason: string,
): LocalEngineeringExecutionReport {
  return {
    status: "blocked",
    execution: {
      ...cloneExecution(execution),
      status: "blocked",
      blockedReasons: [
        ...new Set([
          ...execution.blockedReasons,
          reason,
        ]),
      ],
    },
    evidence: [],
    failureReason: reason,
  };
}

function cloneExecution(
  execution: AutonomousEngineeringExecution,
): AutonomousEngineeringExecution {
  return {
    ...execution,
    steps: execution.steps.map((step) => ({ ...step })),
    completedStepIds: [...execution.completedStepIds],
    blockedReasons: [...execution.blockedReasons],
  };
}

function normalizeTimeout(
  value: number | undefined,
): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1_000 || value > MAX_TIMEOUT_MS) {
    throw new Error(
      `K.I.N.G.S. Local Engineering Execution: timeout must be an integer from 1000 through ${MAX_TIMEOUT_MS} milliseconds`,
    );
  }
  return value;
}

function boundedOutput(
  value: string,
): { text: string; truncated: boolean } {
  if (value.length <= EVIDENCE_OUTPUT_LIMIT) {
    return { text: value, truncated: false };
  }

  return {
    text: `${value.slice(0, EVIDENCE_OUTPUT_LIMIT)}\n… K.I.N.G.S. output evidence truncated …`,
    truncated: true,
  };
}

function executionFailureReason(
  step: EngineeringExecutionStep,
  result: LocalEngineeringProcessResult,
): string {
  if (result.timedOut) {
    return `Engineering ${step.operation} step "${step.id}" exceeded its execution timeout.`;
  }
  if (!result.started) {
    return `Engineering ${step.operation} step "${step.id}" could not start${result.error ? `: ${result.error}` : "."}`;
  }
  if (result.error) {
    return `Engineering ${step.operation} step "${step.id}" failed to execute cleanly: ${result.error}`;
  }
  return `Engineering ${step.operation} step "${step.id}" exited with code ${result.status ?? "unknown"}.`;
}