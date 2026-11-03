import assert from "node:assert/strict";

import type {
  PowerhouseBenchmarkManifest,
  PowerhouseCorpusItem,
  PowerhouseDataRights,
} from "./powerhouse-benchmark-runner";
import { listPowerhouseServiceDomains } from "./powerhouse-service-domain";
import {
  POWERHOUSE_MINIMUM_TRAINING_EXAMPLES_PER_DOMAIN,
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

function benchmark(): PowerhouseBenchmarkManifest {
  const items: PowerhouseCorpusItem[] = [];
  for (const profile of listPowerhouseServiceDomains()) {
    items.push({
      id: `benchmark-train-${profile.id}`,
      domain: profile.id,
      split: "train",
      sourceGroupId: `benchmark-train-source-${profile.id}`,
      prompt: `Benchmark seed training prompt for ${profile.id}`,
      critical: false,
      rights: rights(),
    });
    for (let index = 0; index < 20; index += 1) {
      items.push({
        id: `held-out-${profile.id}-${index}`,
        domain: profile.id,
        split: "held-out",
        sourceGroupId: `held-out-source-${profile.id}-${index}`,
        prompt: `Private held out prompt ${profile.id} ${index}`,
        critical: index === 0,
        rights: rights(false),
        scoring: { kind: "deterministic", minimumCharacters: 1 },
      });
    }
  }
  return {
    benchmarkId: "private-powerhouse-benchmark",
    benchmarkVersion: "2026-10-30.v1",
    createdAt: "2026-10-30T12:00:00.000Z",
    items,
  };
}

function trainingPackage(): PowerhouseTrainingPackage {
  return {
    schemaVersion: "1",
    packageId: "corrective-training-001",
    packageVersion: "2026-10-30.v1",
    createdAt: "2026-10-30T12:30:00.000Z",
    examples: listPowerhouseServiceDomains().flatMap((profile) =>
      Array.from({ length: POWERHOUSE_MINIMUM_TRAINING_EXAMPLES_PER_DOMAIN }, (_, index) => ({
        id: `corrective-${profile.id}-${index}`,
        domain: profile.id,
        sourceGroupId: `corrective-source-${profile.id}-${index}`,
        prompt: `New corrective prompt for ${profile.id} number ${index}`,
        targetResponse: `Rights-cleared expert target for ${profile.id} number ${index}`,
        rights: rights(),
      })),
    ),
  };
}

const manifest = benchmark();
const valid = trainingPackage();
const result = validatePowerhouseTrainingPackage(valid, manifest);
assert.equal(result.exampleCount, 140);
assert.match(result.packageSha256, /^[a-f0-9]{64}$/u);
assert.match(result.benchmarkManifestSha256, /^[a-f0-9]{64}$/u);
for (const count of Object.values(result.domainCounts)) {
  assert.equal(count, POWERHOUSE_MINIMUM_TRAINING_EXAMPLES_PER_DOMAIN);
}

const promptLeak = structuredClone(valid);
promptLeak.examples[0].prompt = manifest.items.find((item) => item.split === "held-out")!.prompt;
assert.throws(
  () => validatePowerhouseTrainingPackage(promptLeak, manifest),
  /overlaps evaluation data/u,
);

const sourceLeak = structuredClone(valid);
sourceLeak.examples[0].sourceGroupId = manifest.items.find((item) => item.split === "held-out")!.sourceGroupId;
assert.throws(
  () => validatePowerhouseTrainingPackage(sourceLeak, manifest),
  /source group.*overlaps evaluation data/u,
);

const denied = structuredClone(valid);
denied.examples[0].rights.trainingAllowed = false;
assert.throws(
  () => validatePowerhouseTrainingPackage(denied, manifest),
  /training rights are denied/u,
);

const hiddenReviewLeak = structuredClone(valid) as PowerhouseTrainingPackage & {
  examples: Array<PowerhouseTrainingPackage["examples"][number] & { reviewEvidence?: string }>;
};
hiddenReviewLeak.examples[0].reviewEvidence = "rubric-review:private-answer";
assert.throws(
  () => validatePowerhouseTrainingPackage(hiddenReviewLeak, manifest),
  /unsupported field.*reviewEvidence/u,
);

const insufficient = structuredClone(valid);
insufficient.examples = insufficient.examples.filter(
  (example) => !(example.domain === "coding" && example.id.endsWith("-19")),
);
assert.throws(
  () => validatePowerhouseTrainingPackage(insufficient, manifest),
  /domain "coding" requires at least 20 examples/u,
);

console.log("K.I.N.G.S. Powerhouse rights-cleared training package + anti-leakage: SUCCESS");
