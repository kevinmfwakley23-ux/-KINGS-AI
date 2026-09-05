import {
  basename,
  resolve,
} from "node:path";

import {
  LocalEngineeringExecutionRunner,
  type LocalEngineeringExecutionReport,
} from "./local-engineering-execution-runner";

import {
  LocalProjectEngineeringReadinessAuthority,
  type LocalProjectEngineeringReadinessResult,
} from "./local-project-engineering-readiness";

export type OwnerEngineeringAction = "readiness" | "verify";

export interface OwnerEngineeringControlRequest {
  action: OwnerEngineeringAction;
  workspacePath: string;
  projectId?: string;
  timeoutMs?: number;
}

export interface OwnerEngineeringReadinessSummary {
  projectId: string;
  workspacePath: string;
  status: LocalProjectEngineeringReadinessResult["execution"]["status"];
  primaryLanguage?: string;
  detectedLanguages: string[];
  packageManagers: string[];
  requiredOperations: string[];
  verifiedToolchains: Array<{
    language: string;
    verified: boolean;
    toolchainId: string;
  }>;
  blockedReasons: string[];
  plannedSteps: Array<{
    id: string;
    sequence: number;
    language: string;
    operation: string;
  }>;
}

export interface OwnerEngineeringVerifySummary {
  status: LocalEngineeringExecutionReport["status"];
  verified: boolean;
  failedStepId?: string;
  failureReason?: string;
  evidence: Array<{
    executionStepId: string;
    sequence: number;
    language: string;
    operation: string;
    exitCode: number | null;
    succeeded: boolean;
    timedOut: boolean;
    durationMs: number;
    stdout: string;
    stderr: string;
  }>;
}

export interface OwnerEngineeringControlResult {
  ok: boolean;
  action: OwnerEngineeringAction;
  projectId: string;
  workspacePath: string;
  startedAt: string;
  completedAt: string;
  readiness: OwnerEngineeringReadinessSummary;
  verify?: OwnerEngineeringVerifySummary;
}

const FIXED_OPERATIONS = ["build", "test"] as const;
const DEFAULT_VERIFY_TIMEOUT_MS = 120_000;

/**
 * Fixed-operation control worker used by the authenticated owner console.
 *
 * The HTTP layer never supplies a command, path, executable, or arguments.
 * Workspace comes from server configuration, and this worker derives the exact
 * repository-native build/test commands through the existing readiness authority.
 */
export async function runOwnerEngineeringControl(
  request: OwnerEngineeringControlRequest,
): Promise<OwnerEngineeringControlResult> {
  const startedAt = new Date().toISOString();
  const action = request.action;
  if (action !== "readiness" && action !== "verify") {
    throw new Error("K.I.N.G.S. Owner Engineering Control: unsupported fixed action.");
  }

  const workspacePath = resolve(requiredText(request.workspacePath, "workspace path"));
  const projectId = normalizeProjectId(
    (request.projectId ?? basename(workspacePath)) || "owner-workspace",
  );

  const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
    id: projectId,
    projectPath: workspacePath,
    requiredOperations: [...FIXED_OPERATIONS],
    executionId: `owner-engineering-${projectId}-${Date.now()}`,
  });

  const readinessSummary = summarizeReadiness(readiness);
  if (action === "readiness") {
    return {
      ok: readiness.execution.status !== "blocked",
      action,
      projectId,
      workspacePath,
      startedAt,
      completedAt: new Date().toISOString(),
      readiness: readinessSummary,
    };
  }

  const report = new LocalEngineeringExecutionRunner().execute({
    readiness,
    authorized: true,
    timeoutMs: normalizeTimeout(request.timeoutMs),
  });
  const verify = summarizeVerify(report);

  return {
    ok: verify.verified,
    action,
    projectId,
    workspacePath,
    startedAt,
    completedAt: new Date().toISOString(),
    readiness: readinessSummary,
    verify,
  };
}

function summarizeReadiness(
  readiness: LocalProjectEngineeringReadinessResult,
): OwnerEngineeringReadinessSummary {
  return {
    projectId: readiness.execution.projectId,
    workspacePath: readiness.profile.projectPath,
    status: readiness.execution.status,
    ...(readiness.environment.primaryLanguage
      ? { primaryLanguage: readiness.environment.primaryLanguage }
      : {}),
    detectedLanguages: readiness.environment.languages.map((entry) => entry.language),
    packageManagers: [...readiness.environment.packageManagers],
    requiredOperations: [...readiness.profile.requiredOperations],
    verifiedToolchains: readiness.verifications.map((verification) => ({
      language: verification.language,
      verified: verification.verified,
      toolchainId: verification.toolchain.id,
    })),
    blockedReasons: [...readiness.blockedReasons],
    plannedSteps: readiness.execution.steps.map((step) => ({
      id: step.id,
      sequence: step.sequence,
      language: step.language,
      operation: step.operation,
    })),
  };
}

function summarizeVerify(
  report: LocalEngineeringExecutionReport,
): OwnerEngineeringVerifySummary {
  return {
    status: report.status,
    verified: report.status === "completed" && report.evidence.every((entry) => entry.succeeded),
    ...(report.failedStepId ? { failedStepId: report.failedStepId } : {}),
    ...(report.failureReason ? { failureReason: report.failureReason } : {}),
    evidence: report.evidence.map((entry) => ({
      executionStepId: entry.executionStepId,
      sequence: entry.sequence,
      language: entry.language,
      operation: entry.operation,
      exitCode: entry.exitCode,
      succeeded: entry.succeeded,
      timedOut: entry.timedOut,
      durationMs: entry.durationMs,
      stdout: entry.stdout,
      stderr: entry.stderr,
    })),
  };
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_VERIFY_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1_000 || value > 10 * 60_000) {
    throw new Error(
      "K.I.N.G.S. Owner Engineering Control: timeout must be an integer from 1000 through 600000 milliseconds.",
    );
  }
  return value;
}

function requiredText(value: string, label: string): string {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new Error(`K.I.N.G.S. Owner Engineering Control: ${label} is required.`);
  }
  return result;
}

function normalizeProjectId(value: string): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
  return normalized || "owner-workspace";
}

async function runCli(): Promise<void> {
  const action = process.argv[2];
  if (action !== "readiness" && action !== "verify") {
    throw new Error("Usage: owner-engineering-control <readiness|verify>");
  }
  const workspacePath = process.env.KINGS_CODING_MACHINE_WORKSPACE ?? process.cwd();
  const projectId = process.env.KINGS_CODING_MACHINE_PROJECT_ID;
  const timeoutRaw = process.env.KINGS_CODING_MACHINE_VERIFY_TIMEOUT_MS;
  const timeoutMs = timeoutRaw === undefined ? undefined : Number(timeoutRaw);
  const result = await runOwnerEngineeringControl({
    action,
    workspacePath,
    ...(projectId ? { projectId } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok && action === "verify") process.exitCode = 2;
}

if (require.main === module) {
  runCli().catch((error) => {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: "owner_engineering_control_failed",
      message: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  });
}
