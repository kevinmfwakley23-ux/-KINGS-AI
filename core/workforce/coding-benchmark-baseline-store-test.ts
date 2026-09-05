import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CodingBenchmarkBaselineStore,
  type CodingBenchmarkBaselineRecord,
} from "./coding-benchmark-baseline-store";

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-benchmark-baseline-"));
  try {
    const path = join(root, "accepted", "baseline.json");
    const store = new CodingBenchmarkBaselineStore(path);
    assert.equal(await store.load(), undefined);

    const perLanguage = {
      typescript: { cases: 2, passed: 2, passRate: 1 },
      javascript: { cases: 2, passed: 2, passRate: 1 },
      python: { cases: 2, passed: 2, passRate: 1 },
      go: { cases: 2, passed: 2, passRate: 1 },
      rust: { cases: 2, passed: 2, passRate: 1 },
      java: { cases: 2, passed: 2, passRate: 1 },
    };
    const record: CodingBenchmarkBaselineRecord = {
      schemaVersion: 1,
      suiteId: "kings-coding-powerhouse-v1",
      acceptedAt: "2026-09-04T17:50:00.000Z",
      sourceRevision: "verified-revision-123",
      summary: {
        cases: 12,
        passed: 12,
        passRate: 1,
        totalTokens: 120_000,
        cachedTokens: 40_000,
        totalCostUsd: 0.42,
        totalDurationMs: 80_000,
        byLanguage: perLanguage,
      },
    };

    await store.saveAccepted(record);
    const loaded = await store.load();
    assert.deepEqual(loaded, record);

    if (!loaded) throw new Error("accepted baseline missing");
    loaded.summary.totalTokens = 1;
    assert.equal((await store.load())?.summary.totalTokens, 120_000, "loaded baseline must not mutate durable accepted evidence");

    await writeFile(path, "{broken", "utf8");
    await assert.rejects(
      () => store.load(),
      /invalid JSON/,
      "corrupt benchmark baseline must fail closed instead of silently resetting",
    );

    console.log("CODING-BASELINE-001 accepted multilingual benchmark baseline persisted: SUCCESS");
    console.log("CODING-BASELINE-002 durable baseline returned by value: SUCCESS");
    console.log("CODING-BASELINE-003 corrupt baseline fails closed: SUCCESS");
    console.log("K.I.N.G.S. CODING BENCHMARK BASELINE STORE: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
