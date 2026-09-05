import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CodingBenchmarkRunner,
  MultilingualCodingBenchmarkRegistry,
  type CodingBenchmarkExecution,
} from "./coding-benchmark-lab";

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-benchmark-lab-test-"));
  try {
    const fixture = join(root, "javascript-fix");
    await mkdir(fixture, { recursive: true });
    await writeFile(
      join(fixture, "math.js"),
      "exports.add = (a, b) => a - b;\n",
      "utf8",
    );
    await writeFile(
      join(fixture, "verify.js"),
      [
        'const { add } = require("./math");',
        'if (add(2, 3) !== 5) throw new Error("add is incorrect");',
        'console.log("verification passed");',
      ].join("\n"),
      "utf8",
    );

    const registry = new MultilingualCodingBenchmarkRegistry();
    for (const language of [
      "typescript",
      "javascript",
      "python",
      "go",
      "rust",
      "java",
    ] as const) {
      registry.register({
        id: `repo-${language}-001`,
        language,
        fixtureRoot: fixture,
        objective: `Repair a ${language} repository behavior regression.`,
        acceptanceCriteria: ["Executable verification must pass."],
        verification: [{ command: process.execPath, args: ["verify.js"] }],
        maxTouchedFiles: 2,
      });
    }
    assert.equal(registry.list().length, 6, "benchmark registry must cover all required language families");

    const runner = new CodingBenchmarkRunner();
    const benchmark = registry.list().find((item) => item.language === "javascript");
    if (!benchmark) throw new Error("javascript benchmark missing");
    const execution = await runner.run(benchmark, async (_case, workspace) => {
      await writeFile(
        join(workspace, "math.js"),
        "exports.add = (a, b) => a + b;\n",
        "utf8",
      );
      return {
        inputTokens: 800,
        outputTokens: 200,
        cachedTokens: 300,
        costUsd: 0.01,
        touchedFiles: ["math.js"],
        routeLabel: "benchmark-test-route",
      };
    });
    assert(execution.passed, execution.failureReason ?? "benchmark should pass");
    assert.equal(execution.totalTokens, 1_000);
    assert.equal(execution.cachedTokens, 300);
    assert.equal(execution.verification.length, 1);
    assert(execution.verification[0].passed);

    const passingSet: CodingBenchmarkExecution[] = [
      execution,
      { ...execution, benchmarkId: "python-1", language: "python", durationMs: Math.max(1, execution.durationMs) },
      { ...execution, benchmarkId: "go-1", language: "go", durationMs: Math.max(1, execution.durationMs) },
      { ...execution, benchmarkId: "rust-1", language: "rust", durationMs: Math.max(1, execution.durationMs) },
      { ...execution, benchmarkId: "ts-1", language: "typescript", durationMs: Math.max(1, execution.durationMs) },
      { ...execution, benchmarkId: "java-1", language: "java", durationMs: Math.max(1, execution.durationMs) },
    ];
    const baseline = runner.summarize(passingSet);
    assert.equal(baseline.passRate, 1);
    assert.equal(baseline.byLanguage.rust.passRate, 1);

    const accepted = runner.compare(passingSet, baseline, {
      minimumPassRate: 0.9,
      maximumPassRateDrop: 0,
      maximumTokenIncreaseRatio: 0.1,
      maximumCostIncreaseRatio: 0.1,
      maximumDurationIncreaseRatio: 0.5,
    });
    assert(accepted.accepted);

    const regressed = passingSet.map((item, index) => ({
      ...item,
      passed: index === 0 ? false : item.passed,
      totalTokens: item.totalTokens * 2,
      inputTokens: item.inputTokens * 2,
      costUsd: item.costUsd * 2,
    }));
    const rejected = runner.compare(regressed, baseline, {
      minimumPassRate: 0.9,
      maximumPassRateDrop: 0,
      maximumTokenIncreaseRatio: 0.1,
      maximumCostIncreaseRatio: 0.1,
    });
    assert(!rejected.accepted, "a correctness/token/cost regression must block benchmark acceptance");
    assert(rejected.regressions.some((reason) => /Pass rate/.test(reason)));
    assert(rejected.regressions.some((reason) => /tokens increased/.test(reason)));
    assert(rejected.regressions.some((reason) => /cost increased/.test(reason)));

    console.log("CODING-BENCHMARK-001 executable repository verification: SUCCESS");
    console.log("CODING-BENCHMARK-002 TypeScript/JavaScript/Python/Go/Rust/Java registry: SUCCESS");
    console.log("CODING-BENCHMARK-003 correctness + token + cost regression gate: SUCCESS");
    console.log("K.I.N.G.S. MULTILINGUAL CODING BENCHMARK LAB: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
