import { stat, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter, isAbsolute, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
const ALLOWED_OPERATIONS = Object.freeze(["lint", "typecheck", "compile", "build", "test"]);
const ALLOWED_OPERATION_SET = new Set(ALLOWED_OPERATIONS);

let runtime;

function loadRuntime() {
  if (runtime) return runtime;
  try {
    const readiness = require("../../build/core/workforce/local-project-engineering-readiness.js");
    const execution = require("../../build/core/workforce/local-engineering-execution-runner.js");
    runtime = {
      LocalProjectEngineeringReadinessAuthority: readiness.LocalProjectEngineeringReadinessAuthority,
      LocalEngineeringExecutionRunner: execution.LocalEngineeringExecutionRunner,
    };
    if (typeof runtime.LocalProjectEngineeringReadinessAuthority !== "function" || typeof runtime.LocalEngineeringExecutionRunner !== "function") {
      throw new Error("compiled engineering authorities are incomplete");
    }
    return runtime;
  } catch (error) {
    throw new Error(`K.I.N.G.S. Owner Engineering requires a successful npm run build before use: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function normalizeEngineeringOperations(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Choose at least one governed engineering operation.");
  }
  const result = [...new Set(value.map((item) => String(item ?? "").trim()))];
  for (const operation of result) {
    if (!ALLOWED_OPERATION_SET.has(operation)) {
      throw new Error(`Engineering operation "${operation}" is not allowed through the owner console.`);
    }
  }
  return result;
}

export function normalizeProjectId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) {
    throw new Error("Project id must use 1-80 letters, numbers, dots, underscores, or hyphens and start with a letter/number.");
  }
  return id;
}

export async function resolveAuthorizedEngineeringProjectPath(value, env = process.env) {
  const requested = String(value ?? "").trim();
  if (!requested) throw new Error("Project path is required.");
  if (requested.includes("\0")) throw new Error("Project path contains an invalid NUL character.");

  let projectPath;
  try {
    projectPath = await realpath(resolve(requested));
  } catch {
    throw new Error(`Engineering project path does not exist: ${requested}`);
  }
  const info = await stat(projectPath);
  if (!info.isDirectory()) throw new Error("Engineering project path must be a directory.");

  const roots = await authorizedRoots(env);
  if (!roots.some((root) => inside(root, projectPath))) {
    throw new Error(`Engineering project path is outside KINGS_ENGINEERING_ROOTS: ${projectPath}`);
  }
  return projectPath;
}

export async function inspectEngineeringProject(input, env = process.env) {
  const projectId = normalizeProjectId(input?.projectId);
  const projectPath = await resolveAuthorizedEngineeringProjectPath(input?.projectPath, env);
  const operations = normalizeEngineeringOperations(input?.operations);
  const { LocalProjectEngineeringReadinessAuthority } = loadRuntime();
  const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
    id: projectId,
    projectPath,
    requiredOperations: operations,
    executionId: `owner-execution-${projectId}`,
  });
  return { readiness, public: summarizeReadiness(readiness) };
}

export async function executeEngineeringProject(input, env = process.env) {
  if (input?.authorizeExecution !== true) {
    throw new Error("Explicit owner execution authorization is required.");
  }
  const inspection = await inspectEngineeringProject(input, env);
  if (inspection.readiness.execution.status === "blocked") {
    return {
      inspection: inspection.public,
      report: {
        status: "blocked",
        evidence: [],
        failureReason: inspection.readiness.blockedReasons.join(" ") || "Repository readiness is blocked.",
      },
    };
  }
  const { LocalEngineeringExecutionRunner } = loadRuntime();
  const report = new LocalEngineeringExecutionRunner().execute({
    readiness: inspection.readiness,
    authorized: true,
    ...(input?.timeoutMs === undefined ? {} : { timeoutMs: normalizeTimeout(input.timeoutMs) }),
  });
  return { inspection: inspection.public, report: summarizeExecution(report) };
}

export function summarizeReadiness(readiness) {
  return {
    projectPath: readiness.environment.projectPath,
    scannedFileCount: readiness.environment.scannedFileCount,
    primaryLanguage: readiness.environment.primaryLanguage ?? null,
    languages: readiness.environment.languages.map((item) => ({
      language: item.language,
      fileCount: item.fileCount,
      extensions: [...item.extensions],
    })),
    executionLanguages: readiness.executionLanguages.map((item) => item.language),
    packageManagers: [...readiness.environment.packageManagers],
    declaredPackageManager: readiness.environment.declaredPackageManager ?? null,
    buildSystems: [...readiness.environment.buildSystems],
    manifestFiles: [...readiness.environment.manifestFiles],
    verifications: readiness.verifications.map((item) => ({
      language: item.language,
      verified: item.verified,
      toolchainId: item.toolchain?.id ?? null,
      unsupportedOperations: [...item.unsupportedOperations],
      missingExecutables: [...item.missingExecutables],
      missingCapabilities: [...(item.missingCapabilities ?? [])],
    })),
    operations: readiness.profile.requiredOperations ? [...readiness.profile.requiredOperations] : [],
    executionStatus: readiness.execution.status,
    steps: readiness.execution.steps.map((step) => ({
      id: step.id,
      sequence: step.sequence,
      language: step.language,
      operation: step.operation,
      status: step.status,
    })),
    blockedReasons: [...readiness.blockedReasons],
  };
}

export function summarizeExecution(report) {
  return {
    status: report.status,
    failedStepId: report.failedStepId ?? null,
    failureReason: report.failureReason ?? null,
    executionStatus: report.execution?.status ?? report.status,
    completedStepIds: [...(report.execution?.completedStepIds ?? [])],
    evidence: report.evidence.map((item) => ({
      executionStepId: item.executionStepId,
      sequence: item.sequence,
      language: item.language,
      operation: item.operation,
      command: item.command,
      args: [...item.args],
      resolvedExecutable: item.resolvedExecutable,
      resolvedArgs: [...item.resolvedArgs],
      started: item.started,
      exitCode: item.exitCode,
      signal: item.signal ?? null,
      succeeded: item.succeeded,
      timedOut: item.timedOut,
      durationMs: item.durationMs,
      stdout: item.stdout,
      stderr: item.stderr,
      stdoutTruncated: item.stdoutTruncated,
      stderrTruncated: item.stderrTruncated,
      error: item.error ?? null,
    })),
  };
}

async function authorizedRoots(env) {
  const configured = String(env.KINGS_ENGINEERING_ROOTS ?? "").trim();
  const raw = configured ? configured.split(delimiter) : [process.cwd()];
  const roots = [];
  for (const item of raw) {
    const candidate = item.trim();
    if (!candidate) continue;
    try {
      const path = await realpath(resolve(candidate));
      if ((await stat(path)).isDirectory()) roots.push(path);
    } catch {
      throw new Error(`Configured KINGS_ENGINEERING_ROOTS entry does not exist or is not a directory: ${candidate}`);
    }
  }
  if (!roots.length) throw new Error("KINGS_ENGINEERING_ROOTS resolved to no usable directories.");
  return [...new Set(roots)];
}

function inside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function normalizeTimeout(value) {
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 10 * 60_000) {
    throw new Error("Engineering timeout must be an integer from 1000 through 600000 milliseconds.");
  }
  return timeout;
}

export const OWNER_ENGINEERING_OPERATIONS = ALLOWED_OPERATIONS;
