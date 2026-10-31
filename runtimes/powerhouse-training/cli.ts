import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { lstat, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { ExecutionSandbox } from "../../core/workforce/execution-sandbox";
import type { PowerhouseBenchmarkManifest } from "../../core/workforce/powerhouse-benchmark-runner";
import {
  PowerhouseModelTrainingExecutor,
  validatePowerhouseModelBuildRecord,
  type PowerhouseModelBuildRecord,
  type PowerhouseTrainingExecutionPort,
  type PowerhouseTrainingJob,
} from "../../core/workforce/powerhouse-model-training";
import type { PowerhouseTrainingPackage } from "../../core/workforce/powerhouse-training-package";
import { readPowerhouseJsonFile } from "../powerhouse-evaluation/cli";

interface PowerhouseTrainerRunner {
  command: string;
  commandSha256: string;
  args: string[];
  workingDirectory: string;
  trainerArtifactPath: string;
  modelArtifactPath: string;
  timeoutMs: number;
}

interface PowerhouseTrainingLaunchManifest {
  schemaVersion: "1";
  job: PowerhouseTrainingJob;
  runner: PowerhouseTrainerRunner;
}

export interface PowerhouseSignedBuildArtifact {
  schemaVersion: "1";
  buildRecord: PowerhouseModelBuildRecord;
  ownerAuthorizationHmacSha256: string;
}

export interface PowerhouseTrainingCliOptions {
  trainingPackagePath: string;
  benchmarkManifestPath: string;
  launchManifestPath: string;
  outputPath: string;
}

function usage(): string {
  return [
    "Usage:",
    "  node build/runtimes/powerhouse-training/cli.js \\",
    "    --training-package <rights-cleared-package.json> \\",
    "    --benchmark-manifest <private-benchmark-manifest.json> \\",
    "    --launch-manifest <owner-approved-training-job.json> \\",
    "    --output <signed-model-build.json>",
  ].join("\n");
}

function parseArguments(values: string[]): PowerhouseTrainingCliOptions {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(usage());
    if (parsed.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    parsed.set(flag, value);
  }
  const allowed = new Set(["--training-package", "--benchmark-manifest", "--launch-manifest", "--output"]);
  for (const flag of parsed.keys()) {
    if (!allowed.has(flag)) throw new Error(`Unknown option: ${flag}\n${usage()}`);
  }
  const required = (flag: string): string => {
    const value = parsed.get(flag)?.trim();
    if (!value) throw new Error(`Missing required option: ${flag}\n${usage()}`);
    return resolve(value);
  };
  return {
    trainingPackagePath: required("--training-package"),
    benchmarkManifestPath: required("--benchmark-manifest"),
    launchManifestPath: required("--launch-manifest"),
    outputPath: required("--output"),
  };
}

function isWithin(candidate: string, root: string): boolean {
  const nested = relative(resolve(root), resolve(candidate));
  return nested === "" || (!nested.startsWith("..") && !isAbsolute(nested));
}

async function fileSha256(path: string): Promise<string> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Trainer artifact must be a regular non-symbolic-link file: ${path}`);
  }
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function ownerSignature(record: PowerhouseModelBuildRecord, ownerToken: string): string {
  return createHmac("sha256", ownerToken).update(JSON.stringify(stableValue(record))).digest("hex");
}

export function verifyPowerhouseSignedBuildArtifact(
  artifact: PowerhouseSignedBuildArtifact,
  ownerToken: string,
): void {
  if (!artifact || typeof artifact !== "object" || artifact.schemaVersion !== "1") {
    throw new Error("Signed Powerhouse model-build artifact schema is invalid");
  }
  if (!ownerToken.trim() || ownerToken.trim().length < 24) {
    throw new Error("Owner token must contain at least 24 characters");
  }
  validatePowerhouseModelBuildRecord(artifact.buildRecord);
  if (!/^[a-f0-9]{64}$/u.test(artifact.ownerAuthorizationHmacSha256)) {
    throw new Error("Signed Powerhouse model-build owner authorization is invalid");
  }
  const expected = Buffer.from(ownerSignature(artifact.buildRecord, ownerToken.trim()), "hex");
  const supplied = Buffer.from(artifact.ownerAuthorizationHmacSha256, "hex");
  if (expected.byteLength !== supplied.byteLength || !timingSafeEqual(expected, supplied)) {
    throw new Error("Signed Powerhouse model-build owner authorization does not match");
  }
}

async function writeArtifact(path: string, artifact: PowerhouseSignedBuildArtifact): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function acquireLock(path: string): Promise<() => Promise<void>> {
  const lockPath = `${path}.lock`;
  const handle = await open(lockPath, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error(`Powerhouse model build is already locked: ${lockPath}`);
    throw error;
  });
  await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
  return async () => {
    await handle.close();
    await unlink(lockPath);
  };
}

function validateLaunchManifest(value: unknown): PowerhouseTrainingLaunchManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Training launch manifest must be an object");
  }
  const manifest = value as PowerhouseTrainingLaunchManifest;
  if (manifest.schemaVersion !== "1" || !manifest.job || !manifest.runner) {
    throw new Error("Training launch manifest schema is invalid");
  }
  const runner = manifest.runner;
  if (!isAbsolute(runner.command)) throw new Error("Trainer command must be an absolute executable path");
  if (!/^[a-f0-9]{64}$/u.test(runner.commandSha256)) {
    throw new Error("Trainer command SHA-256 is invalid");
  }
  const forbiddenCommands = new Set(["sh", "bash", "zsh", "fish", "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe"]);
  const commandName = runner.command.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase();
  if (commandName && forbiddenCommands.has(commandName)) {
    throw new Error("Shell interpreters are forbidden as Powerhouse trainer commands");
  }
  if (!Array.isArray(runner.args) || runner.args.some((arg) => typeof arg !== "string")) {
    throw new Error("Trainer arguments must be a text array");
  }
  if (!Number.isInteger(runner.timeoutMs) || runner.timeoutMs < 1_000 || runner.timeoutMs > 7 * 24 * 60 * 60_000) {
    throw new Error("Trainer timeout must be between 1 second and 7 days");
  }
  for (const placeholder of ["{trainingPackage}", "{benchmarkManifest}", "{modelArtifact}"]) {
    if (!runner.args.includes(placeholder)) throw new Error(`Trainer arguments must include ${placeholder}`);
  }
  return manifest;
}

class SandboxedTrainerExecution implements PowerhouseTrainingExecutionPort {
  private readonly workingDirectory: string;
  private readonly modelArtifactPath: string;
  private readonly sandbox: ExecutionSandbox;

  constructor(
    private readonly runner: PowerhouseTrainerRunner,
    private readonly trainingPackagePath: string,
    private readonly benchmarkManifestPath: string,
  ) {
    this.workingDirectory = resolve(runner.workingDirectory);
    this.modelArtifactPath = resolve(runner.modelArtifactPath);
    const trainerArtifactPath = resolve(runner.trainerArtifactPath);
    for (const [label, path] of [
      ["training package", trainingPackagePath],
      ["benchmark manifest", benchmarkManifestPath],
      ["trainer artifact", trainerArtifactPath],
      ["model artifact", this.modelArtifactPath],
    ] as const) {
      if (!isWithin(path, this.workingDirectory)) {
        throw new Error(`${label} must stay inside the authorized training working directory`);
      }
    }
    this.sandbox = new ExecutionSandbox({
      allowedCommands: [runner.command],
      allowedWorkingDirectories: [this.workingDirectory],
      allowedReadPaths: [this.workingDirectory],
      allowedWritePaths: [this.workingDirectory],
      allowedEnvironmentKeys: [],
      allowedSideEffects: ["read", "write", "execute"],
      timeoutMs: runner.timeoutMs,
      maxOutputBytes: 1024 * 1024,
      maxConcurrentProcesses: 1,
      allowShell: false,
      allowNetwork: false,
    });
  }

  async execute(_job: PowerhouseTrainingJob) {
    const args = this.runner.args.map((arg) => ({
      "{trainingPackage}": this.trainingPackagePath,
      "{benchmarkManifest}": this.benchmarkManifestPath,
      "{modelArtifact}": this.modelArtifactPath,
    })[arg] ?? arg);
    const result = await this.sandbox.execute({
      command: this.runner.command,
      args,
      workingDirectory: this.workingDirectory,
      sideEffects: ["read", "write", "execute"],
    });
    return {
      started: true,
      exitCode: result.exitCode,
      ...(result.signal ? { signal: result.signal } : {}),
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
      completedAt: result.completedAt,
    };
  }

  async readModelArtifact(): Promise<Uint8Array> {
    const metadata = await lstat(this.modelArtifactPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("model artifact is not a regular non-symbolic-link file");
    }
    return readFile(this.modelArtifactPath);
  }
}

export async function runPowerhouseTrainingFiles(
  options: PowerhouseTrainingCliOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PowerhouseSignedBuildArtifact> {
  const ownerToken = env.KINGS_CODING_MACHINE_TOKEN?.trim();
  if (!ownerToken || ownerToken.length < 24) {
    throw new Error("Powerhouse training requires KINGS_CODING_MACHINE_TOKEN with at least 24 characters");
  }
  const paths = [options.trainingPackagePath, options.benchmarkManifestPath, options.launchManifestPath, options.outputPath];
  if (new Set(paths.map((path) => resolve(path))).size !== paths.length) {
    throw new Error("Training inputs and output must use different files");
  }
  const trainingPackage = await readPowerhouseJsonFile(options.trainingPackagePath, "Training package") as PowerhouseTrainingPackage;
  const benchmarkManifest = await readPowerhouseJsonFile(options.benchmarkManifestPath, "Benchmark manifest") as PowerhouseBenchmarkManifest;
  const launch = validateLaunchManifest(await readPowerhouseJsonFile(options.launchManifestPath, "Training launch manifest"));
  if (JSON.stringify(launch).includes(ownerToken)) {
    throw new Error("Owner token must not appear in the training launch manifest");
  }
  const commandDigest = await fileSha256(resolve(launch.runner.command));
  if (commandDigest !== launch.runner.commandSha256) {
    throw new Error("Trainer command digest does not match the owner-approved launch manifest");
  }
  const trainerDigest = await fileSha256(resolve(launch.runner.trainerArtifactPath));
  if (trainerDigest !== launch.job.trainer.immutableDigest) {
    throw new Error("Trainer artifact digest does not match the owner-approved job");
  }
  const release = await acquireLock(options.outputPath);
  try {
    const execution = new SandboxedTrainerExecution(
      launch.runner,
      options.trainingPackagePath,
      options.benchmarkManifestPath,
    );
    const buildRecord = await new PowerhouseModelTrainingExecutor(execution).execute(
      launch.job,
      trainingPackage,
      benchmarkManifest,
    );
    const artifact: PowerhouseSignedBuildArtifact = {
      schemaVersion: "1",
      buildRecord,
      ownerAuthorizationHmacSha256: ownerSignature(buildRecord, ownerToken),
    };
    verifyPowerhouseSignedBuildArtifact(artifact, ownerToken);
    await writeArtifact(options.outputPath, artifact);
    return artifact;
  } finally {
    await release();
  }
}

if (require.main === module) {
  runPowerhouseTrainingFiles(parseArguments(process.argv.slice(2)))
    .then((artifact) => {
      process.stdout.write(`${JSON.stringify({
        ok: artifact.buildRecord.status === "trained",
        buildId: artifact.buildRecord.buildId,
        outputModelId: artifact.buildRecord.outputModelId,
        status: artifact.buildRecord.status,
        modelArtifactSha256: artifact.buildRecord.modelArtifactSha256,
        freshBenchmarkRunId: artifact.buildRecord.freshBenchmarkRunId,
        buildRecordSha256: artifact.buildRecord.buildRecordSha256,
      })}\n`);
      if (artifact.buildRecord.status !== "trained") process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
