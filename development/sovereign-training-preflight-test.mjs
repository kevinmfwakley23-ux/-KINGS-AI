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

  const base = join(home, "licensed-base");
  mkdirSync(base);
  writeFileSync(join(base, "config.json"), '{"model_type":"test"}\n');
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
  assert.equal(JSON.parse(accepted.stdout).trained, false);
  assert.equal(existsSync(artifact), false, "validation-only must not fabricate an adapter");

  writeFileSync(training, JSON.stringify({
    ...valid, examples: examples.map((item, index) =>
      index === 0 ? { ...item, sourceGroupId: "held-out-source" } : item),
  }));
  const leaking = run(args);
  assert.notEqual(leaking.status, 0, "training and held-out source groups must be disjoint");
  assert.match(leaking.stderr, /overlaps held-out or validation/);
  assert.equal(existsSync(artifact), false, "a failed training preflight cannot create an artifact");

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
