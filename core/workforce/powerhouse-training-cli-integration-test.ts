import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  PowerhouseBenchmarkManifest,
  PowerhouseDataRights,
} from "./powerhouse-benchmark-runner";
import type { PowerhouseTrainingJob } from "./powerhouse-model-training";
import { listPowerhouseServiceDomains } from "./powerhouse-service-domain";
import {
  type PowerhouseTrainingPackage,
  validatePowerhouseTrainingPackage,
} from "./powerhouse-training-package";
import {
  runPowerhouseTrainingFiles,
  verifyPowerhouseSignedBuildArtifact,
} from "../../runtimes/powerhouse-training/cli";

const rightsEvidence = "a".repeat(64);

function rights(trainingAllowed = true): PowerhouseDataRights {
  return {
    licenseId: "owner-cleared-license-v1",
    sourceReference: "owner-private-corpus:2026-10-30",
    permissionReference: "owner-attestation:2026-10-30",
    permissionEvidenceSha256: rightsEvidence,
    attestedBy: "william-kevin-wakley-jr",
    trainingAllowed,
    evaluationAllowed: true,
  };
}

function fixtures(): { manifest: PowerhouseBenchmarkManifest; trainingPackage: PowerhouseTrainingPackage } {
  return {
    manifest: {
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
    },
    trainingPackage: {
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
    },
  };
}

async function run(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "kings-powerhouse-training-"));
  try {
    const { manifest, trainingPackage } = fixtures();
    const hashes = validatePowerhouseTrainingPackage(trainingPackage, manifest);
    const trainingPackagePath = join(directory, "training-package.json");
    const benchmarkManifestPath = join(directory, "benchmark-manifest.json");
    const launchManifestPath = join(directory, "launch.json");
    const modelArtifactPath = join(directory, "model.bin");
    const outputPath = join(directory, "build-record.json");
    const trainerPath = join(directory, "trainer.cjs");
    const trainerSource = [
      'const { readFileSync, writeFileSync } = require("node:fs");',
      'const { createHash } = require("node:crypto");',
      "const [, , trainingPath, benchmarkPath, outputPath] = process.argv;",
      'const digest = createHash("sha256").update(readFileSync(trainingPath)).update(readFileSync(benchmarkPath)).digest("hex");',
      'writeFileSync(outputPath, Buffer.from(`KINGS-MODEL:${digest}`, "utf8"), { flag: "wx" });',
      'process.stdout.write("real trainer subprocess completed\\n");',
    ].join("\n");
    await writeFile(trainingPackagePath, JSON.stringify(trainingPackage), { mode: 0o600 });
    await writeFile(benchmarkManifestPath, JSON.stringify(manifest), { mode: 0o600 });
    await writeFile(trainerPath, trainerSource, { mode: 0o700 });
    const trainerDigest = createHash("sha256").update(trainerSource).digest("hex");
    const commandDigest = createHash("sha256").update(await readFile(process.execPath)).digest("hex");
    const job: PowerhouseTrainingJob = {
      schemaVersion: "1",
      jobId: "training-job-cli-001",
      buildId: "model-build-cli-001",
      createdAt: "2026-10-30T12:45:00.000Z",
      outputModelId: "kings-powerhouse-cli-build-001",
      trainingPackageSha256: hashes.packageSha256,
      benchmarkManifestSha256: hashes.benchmarkManifestSha256,
      baseModel: {
        providerId: "approved-provider",
        modelId: "approved-base-model",
        immutableDigest: "b".repeat(64),
        licenseId: "approved-model-license",
      },
      trainer: {
        trainerId: "fixture-real-subprocess-trainer",
        version: "1.0.0",
        immutableDigest: trainerDigest,
      },
      seed: 24601,
      hyperparameters: { epochs: 1, adapter: "fixture" },
    };
    await writeFile(launchManifestPath, JSON.stringify({
      schemaVersion: "1",
      job,
      runner: {
        command: process.execPath,
        commandSha256: commandDigest,
        args: [trainerPath, "{trainingPackage}", "{benchmarkManifest}", "{modelArtifact}"],
        workingDirectory: directory,
        trainerArtifactPath: trainerPath,
        modelArtifactPath,
        timeoutMs: 30_000,
      },
    }), { mode: 0o600 });

    const ownerToken = "owner-test-token-with-32-characters";
    const artifact = await runPowerhouseTrainingFiles({
      trainingPackagePath,
      benchmarkManifestPath,
      launchManifestPath,
      outputPath,
    }, { KINGS_CODING_MACHINE_TOKEN: ownerToken });
    assert.equal(artifact.buildRecord.status, "trained");
    assert.match(artifact.buildRecord.modelArtifactSha256!, /^[a-f0-9]{64}$/u);
    assert.match(artifact.ownerAuthorizationHmacSha256, /^[a-f0-9]{64}$/u);
    verifyPowerhouseSignedBuildArtifact(artifact, ownerToken);
    assert.throws(
      () => verifyPowerhouseSignedBuildArtifact(artifact, "different-owner-token-32-characters"),
      /authorization does not match/u,
    );
    const tampered = structuredClone(artifact);
    tampered.buildRecord.outputModelId = "tampered-model-id";
    assert.throws(
      () => verifyPowerhouseSignedBuildArtifact(tampered, ownerToken),
      /record was altered/u,
    );
    assert.ok((await stat(modelArtifactPath)).size > 0);
    if (process.platform !== "win32") {
      assert.equal((await stat(outputPath)).mode & 0o077, 0, "signed model-build evidence must be owner-only");
    }
    assert.doesNotMatch(await readFile(outputPath, "utf8"), new RegExp(ownerToken, "u"));

    // The second training program must be pinned to an owner-approved SHA-256.
    // The launcher test checks input-binding and actual process execution; it
    // does NOT claim this synthetic subprocess updated neural network weights.
    const preferencePath = join(directory, "private-preferences.json");
    const preferences = {
      schemaVersion: "1",
      pairs: trainingPackage.examples.map((example) => ({
        id: "preference-" + example.id,
        domain: example.domain,
        sourceGroupId: "preference-" + example.sourceGroupId,
        prompt: "Independent preference question " + example.prompt,
        chosenResponse: "Preferred answer with authorized evidence.",
        rejectedResponse: "Rejected answer lacking verified evidence.",
        rights: rights(),
      })),
    };
    const preferenceText = JSON.stringify(preferences);
    await writeFile(preferencePath, preferenceText, { mode: 0o600 });
    const preferenceHash = createHash("sha256").update(preferenceText).digest("hex");
    // This test fixture pins the source file but does not claim it is a trained model.
    const preferenceTrainerPath = join(directory, "sovereign_preference_stage.py");
    const preferenceTrainerSource = "# integration fixture: executable owner source must be hash-pinned\n";
    await writeFile(preferenceTrainerPath, preferenceTrainerSource, { mode: 0o600 });
    const preferenceTrainerHash = createHash("sha256").update(preferenceTrainerSource).digest("hex");
    const evaluatorPath = join(directory, "sovereign_heldout_stage.py");
    const evaluatorSource = "# verified fixture\n";
    await writeFile(evaluatorPath, evaluatorSource, { mode: 0o600 });
    const evaluatorHash = createHash("sha256").update(evaluatorSource).digest("hex");
    const dualOutputPath = join(directory, "second-build-record.json");
    const dualArtifactPath = join(directory, "second-model.bin");
    const dualJob: PowerhouseTrainingJob = {
      ...job,
      jobId: "training-job-cli-preference-002",
      buildId: "model-build-cli-preference-002",
      outputModelId: "kings-powerhouse-cli-preference-002",
      hyperparameters: {
        ...job.hyperparameters,
        preferencePackageSha256: preferenceHash,
        preferenceTrainerSha256: preferenceTrainerHash,
        heldoutEvaluatorSha256: evaluatorHash,
      },
    };
    const dualRunner = {
      command: process.execPath,
      commandSha256: commandDigest,
      args: [trainerPath, "{trainingPackage}", "{benchmarkManifest}", "{modelArtifact}",
        "--preference-package", "{preferencePackage}"],
      workingDirectory: directory,
      trainerArtifactPath: trainerPath,
      modelArtifactPath: dualArtifactPath,
      preferencePackagePath: preferencePath,
      preferencePackageSha256: preferenceHash,
      preferenceTrainerArtifactPath: preferenceTrainerPath,
      preferenceTrainerSha256: preferenceTrainerHash,
      heldoutEvaluatorArtifactPath: evaluatorPath,
      heldoutEvaluatorSha256: evaluatorHash,
      timeoutMs: 30_000,
    };
    const dualRequest = {
      trainingPackagePath,
      benchmarkManifestPath,
      launchManifestPath,
      outputPath: dualOutputPath,
    };
    await writeFile(launchManifestPath, JSON.stringify({
      schemaVersion: "1", job: dualJob,
      runner: { ...dualRunner, preferencePackageSha256: "0".repeat(64) },
    }));
    await assert.rejects(
      runPowerhouseTrainingFiles(dualRequest, { KINGS_CODING_MACHINE_TOKEN: ownerToken }),
      /Owner-locked preference package path and SHA-256 must match/u,
    );
    await writeFile(launchManifestPath, JSON.stringify({
      schemaVersion: "1", job: dualJob,
      runner: { ...dualRunner, preferencePackagePath: join(tmpdir(), "outside-training-preferences.json") },
    }));
    await assert.rejects(
      runPowerhouseTrainingFiles(dualRequest, { KINGS_CODING_MACHINE_TOKEN: ownerToken }),
      /Preference package must stay in the owner-authorized training directory/u,
    );
    await writeFile(launchManifestPath, JSON.stringify({
      schemaVersion: "1", job: dualJob, runner: dualRunner,
    }));
    const dualArtifact = await runPowerhouseTrainingFiles(
      dualRequest, { KINGS_CODING_MACHINE_TOKEN: ownerToken },
    );
    assert.equal(dualArtifact.buildRecord.status, "trained");
    assert.equal(dualArtifact.buildRecord.hyperparameters.preferencePackageSha256, preferenceHash);
    verifyPowerhouseSignedBuildArtifact(dualArtifact, ownerToken);
    assert.ok((await stat(dualArtifactPath)).size > 0);



    // A signed sovereign training job cannot omit the evaluator digest.
    await writeFile(launchManifestPath, JSON.stringify({
      schemaVersion: "1",
      job: { ...dualJob, hyperparameters: {
        ...dualJob.hyperparameters, heldoutEvaluatorSha256: undefined,
      } },
      runner: { ...dualRunner,
        trainerArtifactPath: join(directory, "sovereign_lora_trainer.py"),
        heldoutEvaluatorArtifactPath: undefined, heldoutEvaluatorSha256: undefined,
      },
    }));
    await assert.rejects(
      runPowerhouseTrainingFiles({
        ...dualRequest, outputPath: join(directory, "missing-evaluator-build.json"),
      }, { KINGS_CODING_MACHINE_TOKEN: ownerToken }),
      /Owner-locked held-out evaluator path and SHA-256 must match/u,
    );

    await writeFile(launchManifestPath, JSON.stringify({
      schemaVersion: "1", job: dualJob,
      runner: { ...dualRunner, heldoutEvaluatorSha256: "0".repeat(64) },
    }));
    await assert.rejects(
      runPowerhouseTrainingFiles({
        ...dualRequest, outputPath: join(directory, "bad-evaluator-hash-build.json"),
      }, { KINGS_CODING_MACHINE_TOKEN: ownerToken }),
      /Owner-locked held-out evaluator path and SHA-256 must match/u,
    );
    await writeFile(launchManifestPath, JSON.stringify({
      schemaVersion: "1", job: dualJob, runner: dualRunner,
    }));
    await writeFile(evaluatorPath, evaluatorSource + "# modified\n");
    await assert.rejects(
      runPowerhouseTrainingFiles({
        ...dualRequest, outputPath: join(directory, "tampered-evaluator-build.json"),
      }, { KINGS_CODING_MACHINE_TOKEN: ownerToken }),
      /Held-out evaluator code differs from the owner-approved digest/u,
    );
    await writeFile(evaluatorPath, evaluatorSource);

    // An altered optimizer module must be rejected before execution.
    await writeFile(preferenceTrainerPath, preferenceTrainerSource + "# modified\n");
    await assert.rejects(
      runPowerhouseTrainingFiles({
        ...dualRequest, outputPath: join(directory, "tampered-optimizer-build.json"),
      }, { KINGS_CODING_MACHINE_TOKEN: ownerToken }),
      /Preference optimizer code differs from the owner-approved digest/u,
    );
    await writeFile(preferenceTrainerPath, preferenceTrainerSource);
    // A changed preference file must fail before creating another build.
    await writeFile(preferencePath, preferenceText + " ");
    await assert.rejects(
      runPowerhouseTrainingFiles({
        ...dualRequest, outputPath: join(directory, "tampered-build-record.json"),
      }, { KINGS_CODING_MACHINE_TOKEN: ownerToken }),
      /Preference package contents differ/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log("K.I.N.G.S. Powerhouse real sandboxed trainer subprocess + signed model build: SUCCESS");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
