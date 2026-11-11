import { createHash } from "node:crypto";

import type { PowerhouseBenchmarkManifest } from "./powerhouse-benchmark-runner";
import {
  type PowerhouseTrainingPackage,
  validatePowerhouseTrainingPackage,
} from "./powerhouse-training-package";

export interface PowerhouseBaseModelIdentity {
  providerId: string;
  modelId: string;
  immutableDigest: string;
  licenseId: string;
}

export interface PowerhouseTrainerIdentity {
  trainerId: string;
  version: string;
  immutableDigest: string;
}

export interface PowerhouseTrainingJob {
  schemaVersion: "1";
  jobId: string;
  buildId: string;
  createdAt: string;
  outputModelId: string;
  trainingPackageSha256: string;
  benchmarkManifestSha256: string;
  baseModel: PowerhouseBaseModelIdentity;
  trainer: PowerhouseTrainerIdentity;
  seed: number;
  hyperparameters: Record<string, string | number | boolean>;
}

export interface PowerhouseTrainingProcessResult {
  started: boolean;
  exitCode: number | null;
  signal?: string;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  completedAt: string;
}

export interface PowerhouseTrainingExecutionPort {
  execute(job: PowerhouseTrainingJob): Promise<PowerhouseTrainingProcessResult>;
  readModelArtifact(job: PowerhouseTrainingJob): Promise<Uint8Array>;
}

export interface PowerhouseModelBuildRecord {
  schemaVersion: "1";
  jobId: string;
  buildId: string;
  outputModelId: string;
  status: "trained" | "failed";
  startedAt: string;
  completedAt: string;
  trainingPackageSha256: string;
  benchmarkManifestSha256: string;
  baseModel: PowerhouseBaseModelIdentity;
  trainer: PowerhouseTrainerIdentity;
  seed: number;
  hyperparameters: Record<string, string | number | boolean>;
  processEvidenceSha256: string;
  modelArtifactSha256?: string;
  freshBenchmarkRunId?: string;
  failureReason?: string;
  buildRecordSha256: string;
}

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function validId(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value.trim())) {
    throw new Error(`K.I.N.G.S. Powerhouse Training: ${label} is invalid`);
  }
  return value.trim();
}

function validSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`K.I.N.G.S. Powerhouse Training: ${label} must be a lowercase SHA-256`);
  }
  return value;
}

function validTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`K.I.N.G.S. Powerhouse Training: ${label} must be a valid timestamp`);
  }
  return value;
}

function validateIdentity(identity: PowerhouseBaseModelIdentity, label: string): void {
  if (!identity || typeof identity !== "object") {
    throw new Error(`K.I.N.G.S. Powerhouse Training: ${label} is required`);
  }
  validId(identity.providerId, `${label} provider id`);
  validId(identity.modelId, `${label} model id`);
  validSha(identity.immutableDigest, `${label} immutable digest`);
  validId(identity.licenseId, `${label} license id`);
}

function validateTrainer(trainer: PowerhouseTrainerIdentity): void {
  if (!trainer || typeof trainer !== "object") {
    throw new Error("K.I.N.G.S. Powerhouse Training: trainer identity is required");
  }
  validId(trainer.trainerId, "trainer id");
  validId(trainer.version, "trainer version");
  validSha(trainer.immutableDigest, "trainer immutable digest");
}

function validateHyperparameters(values: Record<string, string | number | boolean>): void {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("K.I.N.G.S. Powerhouse Training: hyperparameters must be an object");
  }
  for (const [key, value] of Object.entries(values)) {
    validId(key, "hyperparameter name");
    if (
      !(["string", "number", "boolean"] as const).includes(typeof value as "string" | "number" | "boolean") ||
      (typeof value === "number" && !Number.isFinite(value)) ||
      (typeof value === "string" && !value.trim())
    ) {
      throw new Error(`K.I.N.G.S. Powerhouse Training: hyperparameter "${key}" is invalid`);
    }
  }
}

export function validatePowerhouseTrainingJob(
  job: PowerhouseTrainingJob,
  trainingPackage: PowerhouseTrainingPackage,
  benchmarkManifest: PowerhouseBenchmarkManifest,
): void {
  if (!job || typeof job !== "object" || job.schemaVersion !== "1") {
    throw new Error("K.I.N.G.S. Powerhouse Training: job schema is invalid");
  }
  validId(job.jobId, "job id");
  validId(job.buildId, "build id");
  validId(job.outputModelId, "output model id");
  validTimestamp(job.createdAt, "job createdAt");
  if (!Number.isSafeInteger(job.seed) || job.seed < 0) {
    throw new Error("K.I.N.G.S. Powerhouse Training: seed must be a non-negative safe integer");
  }
  validateIdentity(job.baseModel, "base model");
  validateTrainer(job.trainer);
  validateHyperparameters(job.hyperparameters);
  const validated = validatePowerhouseTrainingPackage(trainingPackage, benchmarkManifest);
  if (validSha(job.trainingPackageSha256, "training package SHA-256") !== validated.packageSha256) {
    throw new Error("K.I.N.G.S. Powerhouse Training: training package hash does not match the job");
  }
  if (validSha(job.benchmarkManifestSha256, "benchmark manifest SHA-256") !== validated.benchmarkManifestSha256) {
    throw new Error("K.I.N.G.S. Powerhouse Training: benchmark manifest hash does not match the job");
  }
}

function processEvidence(result: PowerhouseTrainingProcessResult): string {
  return sha256(stableJson({
    started: result.started,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    stdoutSha256: sha256(result.stdout),
    stderrSha256: sha256(result.stderr),
    completedAt: result.completedAt,
  }));
}

function finalizeRecord(
  record: Omit<PowerhouseModelBuildRecord, "buildRecordSha256">,
): PowerhouseModelBuildRecord {
  return { ...record, buildRecordSha256: sha256(stableJson(record)) };
}

export function validatePowerhouseModelBuildRecord(record: PowerhouseModelBuildRecord): void {
  if (!record || typeof record !== "object" || record.schemaVersion !== "1") {
    throw new Error("K.I.N.G.S. Powerhouse Training: model build record schema is invalid");
  }
  validId(record.jobId, "model build job id");
  validId(record.buildId, "model build id");
  validId(record.outputModelId, "model build output model id");
  validTimestamp(record.startedAt, "model build start time");
  validTimestamp(record.completedAt, "model build completion time");
  validSha(record.trainingPackageSha256, "model build training package SHA-256");
  validSha(record.benchmarkManifestSha256, "model build benchmark manifest SHA-256");
  validSha(record.processEvidenceSha256, "model build process evidence SHA-256");
  validateIdentity(record.baseModel, "model build base model");
  validateTrainer(record.trainer);
  validateHyperparameters(record.hyperparameters);
  if (!Number.isSafeInteger(record.seed) || record.seed < 0) {
    throw new Error("K.I.N.G.S. Powerhouse Training: model build seed is invalid");
  }
  if (record.status === "trained") {
    const artifactSha = validSha(record.modelArtifactSha256, "model artifact SHA-256");
    if (record.freshBenchmarkRunId !== `${record.buildId}-${artifactSha.slice(0, 16)}`) {
      throw new Error("K.I.N.G.S. Powerhouse Training: fresh benchmark run id does not match the model artifact");
    }
    if (record.failureReason !== undefined) {
      throw new Error("K.I.N.G.S. Powerhouse Training: trained build may not contain a failure reason");
    }
  } else if (record.status === "failed") {
    if (record.modelArtifactSha256 !== undefined || record.freshBenchmarkRunId !== undefined) {
      throw new Error("K.I.N.G.S. Powerhouse Training: failed build may not contain trained artifact evidence");
    }
    if (typeof record.failureReason !== "string" || !record.failureReason.trim()) {
      throw new Error("K.I.N.G.S. Powerhouse Training: failed build requires a failure reason");
    }
  } else {
    throw new Error("K.I.N.G.S. Powerhouse Training: model build status is invalid");
  }
  const { buildRecordSha256, ...recordCore } = record;
  if (validSha(buildRecordSha256, "model build record SHA-256") !== sha256(stableJson(recordCore))) {
    throw new Error("K.I.N.G.S. Powerhouse Training: model build record was altered");
  }
}

export class PowerhouseModelTrainingExecutor {
  constructor(
    private readonly execution: PowerhouseTrainingExecutionPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    job: PowerhouseTrainingJob,
    trainingPackage: PowerhouseTrainingPackage,
    benchmarkManifest: PowerhouseBenchmarkManifest,
  ): Promise<PowerhouseModelBuildRecord> {
    validatePowerhouseTrainingJob(job, trainingPackage, benchmarkManifest);
    const startedAt = this.now().toISOString();
    const process = await this.execution.execute(job);
    validTimestamp(process.completedAt, "trainer completion time");
    const common = {
      schemaVersion: "1" as const,
      jobId: job.jobId,
      buildId: job.buildId,
      outputModelId: job.outputModelId,
      startedAt,
      completedAt: process.completedAt,
      trainingPackageSha256: job.trainingPackageSha256,
      benchmarkManifestSha256: job.benchmarkManifestSha256,
      baseModel: { ...job.baseModel },
      trainer: { ...job.trainer },
      seed: job.seed,
      hyperparameters: { ...job.hyperparameters },
      processEvidenceSha256: processEvidence(process),
    };

    if (!process.started || process.timedOut || process.exitCode !== 0) {
      const reason = !process.started
        ? "Trainer process did not start."
        : process.timedOut
          ? "Trainer process exceeded its authorized timeout."
          : `Trainer process exited with code ${String(process.exitCode)}.`;
      return finalizeRecord({ ...common, status: "failed", failureReason: reason });
    }

    let artifact: Uint8Array;
    try {
      artifact = await this.execution.readModelArtifact(job);
    } catch (error) {
      return finalizeRecord({
        ...common,
        status: "failed",
        failureReason: `Trainer completed without a readable model artifact: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    if (artifact.byteLength === 0) {
      return finalizeRecord({
        ...common,
        status: "failed",
        failureReason: "Trainer completed with an empty model artifact.",
      });
    }

    const modelArtifactSha256 = sha256(artifact);
    return finalizeRecord({
      ...common,
      status: "trained",
      modelArtifactSha256,
      freshBenchmarkRunId: `${job.buildId}-${modelArtifactSha256.slice(0, 16)}`,
    });
  }
}
