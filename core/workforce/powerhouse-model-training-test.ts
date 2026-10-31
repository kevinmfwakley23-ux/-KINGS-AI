import assert from "node:assert/strict";

import type {
  PowerhouseBenchmarkManifest,
  PowerhouseDataRights,
} from "./powerhouse-benchmark-runner";
import {
  PowerhouseModelTrainingExecutor,
  type PowerhouseTrainingExecutionPort,
  type PowerhouseTrainingJob,
  type PowerhouseTrainingProcessResult,
} from "./powerhouse-model-training";
import { listPowerhouseServiceDomains } from "./powerhouse-service-domain";
import {
  type PowerhouseTrainingPackage,
  validatePowerhouseTrainingPackage,
} from "./powerhouse-training-package";

const evidence = "a".repeat(64);

function rights(trainingAllowed = true): PowerhouseDataRights {
  return {
    licenseId: "owner-cleared-license-v1",
    sourceReference: "owner-private-corpus:2026-10-30",
    permissionReference: "owner-attestation:2026-10-30",
    permissionEvidenceSha256: evidence,
    attestedBy: "william-kevin-wakley-jr",
    trainingAllowed,
    evaluationAllowed: true,
  };
}

function fixtures(): { manifest: PowerhouseBenchmarkManifest; trainingPackage: PowerhouseTrainingPackage } {
  const manifest: PowerhouseBenchmarkManifest = {
    benchmarkId: "private-powerhouse-benchmark",
    benchmarkVersion: "2026-10-30.v1",
    createdAt: "2026-10-30T12:00:00.000Z",
    items: listPowerhouseServiceDomains().flatMap((profile) => [
      {
        id: `benchmark-train-${profile.id}`,
        domain: profile.id,
        split: "train" as const,
        sourceGroupId: `benchmark-train-source-${profile.id}`,
        prompt: `Benchmark seed training prompt for ${profile.id}`,
        critical: false,
        rights: rights(),
      },
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `held-out-${profile.id}-${index}`,
        domain: profile.id,
        split: "held-out" as const,
        sourceGroupId: `held-out-source-${profile.id}-${index}`,
        prompt: `Private held out prompt ${profile.id} ${index}`,
        critical: index === 0,
        rights: rights(false),
        scoring: { kind: "deterministic" as const, minimumCharacters: 1 },
      })),
    ]),
  };
  const trainingPackage: PowerhouseTrainingPackage = {
    schemaVersion: "1",
    packageId: "corrective-training-001",
    packageVersion: "2026-10-30.v1",
    createdAt: "2026-10-30T12:30:00.000Z",
    examples: listPowerhouseServiceDomains().flatMap((profile) =>
      Array.from({ length: 20 }, (_, index) => ({
        id: `corrective-${profile.id}-${index}`,
        domain: profile.id,
        sourceGroupId: `corrective-source-${profile.id}-${index}`,
        prompt: `New corrective prompt for ${profile.id} number ${index}`,
        targetResponse: `Rights-cleared expert target for ${profile.id} number ${index}`,
        rights: rights(),
      })),
    ),
  };
  return { manifest, trainingPackage };
}

class FakeExecution implements PowerhouseTrainingExecutionPort {
  constructor(
    private readonly result: PowerhouseTrainingProcessResult,
    private readonly artifact: Uint8Array | Error,
  ) {}

  async execute(): Promise<PowerhouseTrainingProcessResult> {
    return this.result;
  }

  async readModelArtifact(): Promise<Uint8Array> {
    if (this.artifact instanceof Error) throw this.artifact;
    return this.artifact;
  }
}

function processResult(overrides: Partial<PowerhouseTrainingProcessResult> = {}): PowerhouseTrainingProcessResult {
  return {
    started: true,
    exitCode: 0,
    timedOut: false,
    stdout: "trainer complete",
    stderr: "",
    completedAt: "2026-10-30T13:00:00.000Z",
    ...overrides,
  };
}

async function run(): Promise<void> {
const { manifest, trainingPackage } = fixtures();
const hashes = validatePowerhouseTrainingPackage(trainingPackage, manifest);
const job: PowerhouseTrainingJob = {
  schemaVersion: "1",
  jobId: "training-job-001",
  buildId: "model-build-001",
  createdAt: "2026-10-30T12:45:00.000Z",
  outputModelId: "kings-powerhouse-build-001",
  trainingPackageSha256: hashes.packageSha256,
  benchmarkManifestSha256: hashes.benchmarkManifestSha256,
  baseModel: {
    providerId: "approved-provider",
    modelId: "approved-base-model",
    immutableDigest: "b".repeat(64),
    licenseId: "approved-model-license",
  },
  trainer: {
    trainerId: "approved-trainer",
    version: "1.0.0",
    immutableDigest: "c".repeat(64),
  },
  seed: 24601,
  hyperparameters: { epochs: 3, learning_rate: 0.0001, adapter: "lora" },
};

const now = () => new Date("2026-10-30T12:50:00.000Z");
const artifact = new TextEncoder().encode("real-model-artifact-bytes");
const success = await new PowerhouseModelTrainingExecutor(
  new FakeExecution(processResult(), artifact),
  now,
).execute(job, trainingPackage, manifest);
assert.equal(success.status, "trained");
assert.match(success.modelArtifactSha256!, /^[a-f0-9]{64}$/u);
assert.equal(success.freshBenchmarkRunId, `${job.buildId}-${success.modelArtifactSha256!.slice(0, 16)}`);
assert.match(success.buildRecordSha256, /^[a-f0-9]{64}$/u);

const changedArtifact = await new PowerhouseModelTrainingExecutor(
  new FakeExecution(processResult(), new TextEncoder().encode("different-model-artifact")),
  now,
).execute(job, trainingPackage, manifest);
assert.notEqual(changedArtifact.modelArtifactSha256, success.modelArtifactSha256);
assert.notEqual(changedArtifact.freshBenchmarkRunId, success.freshBenchmarkRunId);

const failed = await new PowerhouseModelTrainingExecutor(
  new FakeExecution(processResult({ exitCode: 7, stderr: "trainer failed" }), artifact),
  now,
).execute(job, trainingPackage, manifest);
assert.equal(failed.status, "failed");
assert.equal(failed.modelArtifactSha256, undefined);
assert.match(failed.failureReason!, /exited with code 7/u);

const missing = await new PowerhouseModelTrainingExecutor(
  new FakeExecution(processResult(), new Error("ENOENT")),
  now,
).execute(job, trainingPackage, manifest);
assert.equal(missing.status, "failed");
assert.equal(missing.modelArtifactSha256, undefined);
assert.match(missing.failureReason!, /without a readable model artifact/u);

const tamperedJob = { ...job, trainingPackageSha256: "d".repeat(64) };
await assert.rejects(
  () => new PowerhouseModelTrainingExecutor(new FakeExecution(processResult(), artifact), now)
    .execute(tamperedJob, trainingPackage, manifest),
  /training package hash does not match/u,
);

console.log("K.I.N.G.S. Powerhouse immutable model build + fresh benchmark identity: SUCCESS");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
