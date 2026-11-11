import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const script = join(root, "runtimes", "powerhouse-training", "sovereign_lora_trainer.py");
const python = process.platform === "win32" ? "python" : "python3";
const home = mkdtempSync(join(tmpdir(), "kings-sovereign-trainer-test-"));

function run(args) {
  return spawnSync(python, [script, ...args], {
    cwd: root, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
}

try {
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--base-model/);
  assert.match(help.stdout, /--validate-only/);

  const curriculum = spawnSync(python, [join(root, "development", "sovereign-training-curriculum-test.py")], {
    cwd: root, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  assert.equal(curriculum.status, 0, curriculum.stderr);
  assert.match(curriculum.stdout, /seven-domain supervised curriculum, sampler and full-answer coverage: SUCCESS/);
  assert.match(help.stdout, /--epochs/);
  assert.match(help.stdout, /--preference-epochs/);
  assert.match(help.stdout, /--retention-epochs/);

  const base = join(home, "licensed-base");
  mkdirSync(base);
  writeFileSync(join(base, "config.json"), '{"model_type":"test"}\n');
  // This is only a synthetic preflight fixture; it is never loaded or trained.
  writeFileSync(join(base, "model.safetensors"), "synthetic-fixture-weights");
  const training = join(home, "training.json");
  const benchmark = join(home, "benchmark.json");
  const artifact = join(home, "adapter.zip");
  const domains = [
    "chat", "coding", "collectibles", "sports-cards",
    "book-editing", "publishing", "storytelling",
  ];
  const examples = domains.flatMap((domain) => Array.from({ length: 20 }, (_, index) => ({
    id: domain + "-train-" + index,
    domain,
    sourceGroupId: domain + "-training-" + index,
    prompt: "Synthetic rights-validation test prompt " + domain + " " + index,
    targetResponse: "Synthetic test target, not trained weights.",
    rights: {
      licenseId: "unit-test-data",
      sourceReference: "synthetic-test",
      permissionReference: "unit-test-generated",
      permissionEvidenceSha256: "a".repeat(64),
      attestedBy: "unit-test-author",
      trainingAllowed: true,
      evaluationAllowed: false,
    },
  })));
  const valid = { schemaVersion: "1", examples };
  writeFileSync(training, JSON.stringify(valid));
  writeFileSync(benchmark, JSON.stringify({
    items: [{ id: "held-out", split: "held-out", sourceGroupId: "held-out-source",
      prompt: "Unseen private benchmark content" }],
  }));
  const args = [
    "--base-model", base, "--training-package", training,
    "--benchmark-manifest", benchmark, "--model-artifact", artifact,
    "--validate-only",
  ];
  const accepted = run(args);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).validatedExamples, 140);
  const firstBaseFingerprint = JSON.parse(accepted.stdout).baseModelFingerprintSha256;
  assert.match(firstBaseFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(accepted.stdout).baseModelWeightFileCount, 1);
  writeFileSync(join(base, "model.safetensors"), "mutated-synthetic-fixture-weights");
  const changedBase = run(args);
  assert.equal(changedBase.status, 0, changedBase.stderr);
  assert.notEqual(JSON.parse(changedBase.stdout).baseModelFingerprintSha256, firstBaseFingerprint);
  writeFileSync(join(base, "model.safetensors"), "synthetic-fixture-weights");
  assert.equal(JSON.parse(accepted.stdout).supervisedEpochs, 3);
  assert.equal(JSON.parse(accepted.stdout).preferenceEpochs, 0);
  assert.equal(JSON.parse(accepted.stdout).retentionEpochs, 0);
  assert.deepEqual(JSON.parse(accepted.stdout).trainingStages, ["supervised-lora"]);
  assert.equal(JSON.parse(accepted.stdout).domainSampling, "seeded-round-robin-without-replacement");
  assert.equal(JSON.parse(accepted.stdout).trained, false);
  assert.equal(existsSync(artifact), false, "validation-only must not fabricate an adapter");

  // Three gradient stages: supervised LoRA, preference DPO, then real
  // anchored retention rehearsal on the SAME authorized supervised data.
  // Preflight runs
  // without PyTorch, GPU, model weights or any invented trained artifact.
  const preferencePath = join(home, "preferences.json");
  const pairs = domains.flatMap((domain) => Array.from({ length: 20 }, (_, index) => ({
    id: domain + "-preference-" + index,
    domain,
    sourceGroupId: domain + "-preference-group-" + index,
    prompt: "Independent synthetic preference test prompt " + domain + " " + index,
    chosenResponse: "Grounded answer A for data-isolation testing.",
    rejectedResponse: "Unverified answer B for data-isolation testing.",
    rights: {
      licenseId: "unit-test-data",
      sourceReference: "synthetic-test",
      permissionReference: "unit-test-generated",
      permissionEvidenceSha256: "b".repeat(64),
      attestedBy: "unit-test-author",
      trainingAllowed: true,
      evaluationAllowed: false,
    },
  })));
  writeFileSync(preferencePath, JSON.stringify({ schemaVersion: "1", pairs }));
  const dualArgs = [...args, "--preference-package", preferencePath];
  const dual = run(dualArgs);
  assert.equal(dual.status, 0, dual.stderr);
  assert.equal(JSON.parse(dual.stdout).validatedExamples, 140);
  assert.equal(JSON.parse(dual.stdout).validatedPreferencePairs, 140);
  assert.equal(JSON.parse(dual.stdout).supervisedEpochs, 3);
  assert.equal(JSON.parse(dual.stdout).preferenceEpochs, 3);
  assert.equal(JSON.parse(dual.stdout).retentionEpochs, 1);
  assert.equal(JSON.parse(dual.stdout).trainingProfile, "standard");

  // Owner-controlled double-intensity training must fail closed unless a
  // separate licensed DPO package and 20 unseen reference answers per office
  // are available. This preflight never pretends to train the base model.
  const noDpoDouble = run([...args, "--training-profile", "double"]);
  assert.notEqual(noDpoDouble.status, 0);
  assert.match(noDpoDouble.stderr, /separately authorized preference package/);
  const noEvidenceDouble = run([...dualArgs, "--training-profile", "double"]);
  assert.notEqual(noEvidenceDouble.status, 0);
  assert.match(noEvidenceDouble.stderr, /at least 20 evaluation-only held-out references/);
  const noEvidenceTriple = run([...dualArgs, "--training-profile", "triple"]);
  assert.notEqual(noEvidenceTriple.status, 0);
  assert.match(noEvidenceTriple.stderr, /at least 20 evaluation-only held-out references/);
  const conflictingDouble = run([...dualArgs, "--training-profile", "double", "--epochs", "4"]);
  assert.notEqual(conflictingDouble.status, 0);
  assert.match(conflictingDouble.stderr, /cannot combine with stage-specific epoch overrides/);
  const extendedHeldout = domains.flatMap((domain) => Array.from({ length: 20 }, (_, index) => ({
    id: domain + "-eval-" + index,
    domain,
    sourceGroupId: domain + "-eval-source-" + index,
    split: "held-out",
    prompt: "Separate unseen evaluation question " + domain + " " + index,
    targetResponse: "Authorized evaluation target " + domain + " " + index,
    rights: {
      licenseId: "synthetic-evaluation-only",
      sourceReference: "synthetic-evaluation-test",
      permissionReference: "synthetic-evaluation-generator",
      permissionEvidenceSha256: "c".repeat(64),
      attestedBy: "unit-test-author",
      evaluationAllowed: true,
      trainingAllowed: false,
    },
  })));
  writeFileSync(benchmark, JSON.stringify({ items: extendedHeldout }));
  const doubled = run([...dualArgs, "--training-profile", "double"]);
  assert.equal(doubled.status, 0, doubled.stderr);
  const doublePlan = JSON.parse(doubled.stdout);
  assert.equal(doublePlan.trainingProfile, "double");
  assert.equal(doublePlan.supervisedEpochs, 6);
  assert.equal(doublePlan.preferenceEpochs, 6);
  assert.equal(doublePlan.retentionEpochs, 2);
  assert.equal(doublePlan.heldOutReferenceCount, 140);
  assert.equal(doublePlan.trained, false);
  assert.equal(existsSync(artifact), false, "double preflight must not invent trained weights");

  // Triple-intensity (9/9/3) must be an explicit authorized choice. It
  // reuses the same real optimizers and cannot claim new data or competence.
  const noDpoTriple = run([...args, "--training-profile", "triple"]);
  assert.notEqual(noDpoTriple.status, 0);
  assert.match(noDpoTriple.stderr, /separately authorized preference package/);
  const conflictingTriple = run([...dualArgs, "--training-profile", "triple", "--retention-epochs", "2"]);
  assert.notEqual(conflictingTriple.status, 0);
  assert.match(conflictingTriple.stderr, /cannot combine with stage-specific epoch overrides/);
  const tripled = run([...dualArgs, "--training-profile", "triple"]);
  assert.equal(tripled.status, 0, tripled.stderr);
  const triplePlan = JSON.parse(tripled.stdout);
  assert.equal(triplePlan.trainingProfile, "triple");
  assert.equal(triplePlan.supervisedEpochs, 9);
  assert.equal(triplePlan.preferenceEpochs, 9);
  assert.equal(triplePlan.retentionEpochs, 3);
  assert.equal(triplePlan.heldOutReferenceCount, 140);
  assert.equal(triplePlan.validatedExamples, 140);
  assert.equal(triplePlan.validatedPreferencePairs, 140);
  assert.deepEqual(triplePlan.trainingStages,
    ["supervised-lora", "preference-dpo", "anchored-retention-rehearsal"]);
  assert.equal(triplePlan.trained, false);
  assert.equal(existsSync(artifact), false, "triple preflight must not invent trained weights");
  writeFileSync(benchmark, JSON.stringify({
    items: [{ id: "held-out", split: "held-out", sourceGroupId: "held-out-source",
      prompt: "Unseen private benchmark content" }],
  }));

  const explicitPasses = run([...dualArgs, "--epochs", "2", "--preference-epochs", "4"]);
  assert.equal(explicitPasses.status, 0, explicitPasses.stderr);
  assert.equal(JSON.parse(explicitPasses.stdout).supervisedEpochs, 2);
  assert.equal(JSON.parse(explicitPasses.stdout).preferenceEpochs, 4);
  assert.deepEqual(JSON.parse(dual.stdout).trainingStages,
    ["supervised-lora", "preference-dpo", "anchored-retention-rehearsal"]);
  const disabledRehearsal = run([...dualArgs, "--retention-epochs", "0"]);
  assert.equal(disabledRehearsal.status, 0, disabledRehearsal.stderr);
  assert.equal(JSON.parse(disabledRehearsal.stdout).retentionEpochs, 0);
  assert.deepEqual(JSON.parse(disabledRehearsal.stdout).trainingStages,
    ["supervised-lora", "preference-dpo"]);
  for (const [flag, value] of [
    ["--retention-epochs", "6"], ["--retention-learning-rate", "0"],
    ["--retention-anchor-strength", "2"],
  ]) {
    const invalid = run([...dualArgs, flag, value]);
    assert.notEqual(invalid.status, 0, `${flag} must reject out-of-range values`);
    assert.match(invalid.stderr, /Invalid bounded training hyperparameters/);
    assert.equal(existsSync(artifact), false);
  }
  assert.equal(JSON.parse(dual.stdout).trained, false);
  assert.equal(existsSync(artifact), false, "dual-stage preflight must not fabricate trained weights");

  for (const [name, edit, expected] of [
    ["overlapping supervised prompt", (p) => ({ ...p, prompt: examples[0].prompt }), /Preference prompt overlaps/],
    ["overlapping benchmark source group", (p) => ({ ...p, sourceGroupId: "held-out-source" }), /Preference source group overlaps/],
    ["no distinction between responses", (p) => ({ ...p, rejectedResponse: p.chosenResponse }), /distinct/],
    ["missing authorization", (p) => ({ ...p, rights: { ...p.rights, trainingAllowed: false } }), /rights are denied/],
  ]) {
    const tampered = pairs.map((pair, index) => index === 0 ? edit(pair) : pair);
    writeFileSync(preferencePath, JSON.stringify({ schemaVersion: "1", pairs: tampered }));
    const refused = run(dualArgs);
    assert.notEqual(refused.status, 0, name + " must be rejected");
    assert.match(refused.stderr, expected);
    assert.equal(existsSync(artifact), false, "rejected preference inputs cannot create fake model weights");
  }
  writeFileSync(preferencePath, JSON.stringify({ schemaVersion: "1", pairs }));

  writeFileSync(training, JSON.stringify({
    ...valid, examples: examples.map((item, index) =>
      index === 0 ? { ...item, sourceGroupId: "held-out-source" } : item),
  }));
  const leaking = run(args);
  assert.notEqual(leaking.status, 0, "training and held-out source groups must be disjoint");
  assert.match(leaking.stderr, /overlaps held-out or validation/);
  assert.equal(existsSync(artifact), false, "a failed training preflight cannot create an artifact");

  writeFileSync(training, JSON.stringify(valid));
  writeFileSync(benchmark, JSON.stringify({
    items: [{ id: "held-out", split: "held-out", sourceGroupId: "separate",
      prompt: examples[0].prompt }],
  }));
  const promptLeak = run(args);
  assert.notEqual(promptLeak.status, 0, "held-out prompt duplication must fail even across distinct groups");
  assert.match(promptLeak.stderr, /held-out training prompt/);

  writeFileSync(benchmark, JSON.stringify({
    items: [{ id: "held-out", split: "held-out", sourceGroupId: "separate",
      prompt: "Unseen private benchmark content" }],
  }));
  writeFileSync(training, JSON.stringify({
    ...valid, examples: examples.map((item, index) =>
      index === 0 ? { ...item, sourceGroupId: "" } : item),
  }));
  const ungrouped = run(args);
  assert.notEqual(ungrouped.status, 0, "training source group must be attributable");
  assert.match(ungrouped.stderr, /sourceGroupId must be nonempty/);

  writeFileSync(training, JSON.stringify(valid));
  writeFileSync(benchmark, JSON.stringify({
    items: [{ id: "held-out", split: "unknown", sourceGroupId: "separate",
      prompt: "Unseen private benchmark content" }],
  }));
  const badSplit = run(args);
  assert.notEqual(badSplit.status, 0, "unrecognized benchmark partitions cannot be treated as held-out evidence");
  assert.match(badSplit.stderr, /Benchmark split must be/);

  writeFileSync(benchmark, JSON.stringify({
    items: [{ id: "held-out", split: "held-out", sourceGroupId: "held-out-source",
      prompt: "Unseen private benchmark content" }],
  }));
  writeFileSync(training, JSON.stringify({
    ...valid, examples: examples.map((item, index) =>
      index === 0 ? { ...item, rights: { ...item.rights, trainingAllowed: false } } : item),
  }));
  const unlicensed = run(args);
  assert.notEqual(unlicensed.status, 0, "unlicensed examples must fail closed");
  assert.match(unlicensed.stderr, /Training rights are not granted/);
  console.log("K.I.N.G.S. offline sovereign trainer preflight: SUCCESS");
} finally {
  rmSync(home, { recursive: true, force: true });
}
