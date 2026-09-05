import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DurableModelRoutingMetricsStore } from "./durable-model-routing-metrics";
import { modelRoutingMetricKey } from "./model-routing";

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-routing-metrics-"));
  const file = join(root, "routing-metrics.json");

  try {
    const first = new DurableModelRoutingMetricsStore(file);
    assert.equal((await first.load()).size, 0);

    await first.record("omniroute", "auto/coding", {
      costBasis: "unknown",
      latencyMs: 980,
      reliability: 61,
    });
    await first.record("9router", "provider/coder", {
      estimatedCost: 0.014,
      costBasis: "provider-reported",
      latencyMs: 420,
      reliability: 96,
    });

    const persistedText = await readFile(file, "utf8");
    assert.match(persistedText, /"version": 1/);
    assert.match(persistedText, /"providerId": "9router"/);
    assert.match(persistedText, /"providerId": "omniroute"/);

    const restarted = new DurableModelRoutingMetricsStore(file);
    const metrics = await restarted.load();
    assert.deepEqual(
      metrics.get(modelRoutingMetricKey("omniroute", "auto/coding")),
      {
        costBasis: "unknown",
        latencyMs: 980,
        reliability: 61,
      },
    );
    assert.deepEqual(
      metrics.get(modelRoutingMetricKey("9router", "provider/coder")),
      {
        estimatedCost: 0.014,
        costBasis: "provider-reported",
        latencyMs: 420,
        reliability: 96,
      },
    );

    await restarted.record("omniroute", "auto/coding", {
      costBasis: "unknown",
      latencyMs: 700,
      reliability: 84,
    });
    const third = new DurableModelRoutingMetricsStore(file);
    assert.equal(
      (await third.load()).get(
        modelRoutingMetricKey("omniroute", "auto/coding"),
      )?.reliability,
      84,
      "latest route evidence must replace older route evidence",
    );

    const malformed = join(root, "malformed.json");
    await writeFile(malformed, "{ definitely not json", "utf8");
    await assert.rejects(
      () => new DurableModelRoutingMetricsStore(malformed).load(),
      /invalid JSON/,
    );

    const invalidMetric = join(root, "invalid-metric.json");
    await writeFile(
      invalidMetric,
      JSON.stringify({
        version: 1,
        routes: [{
          providerId: "omniroute",
          modelId: "auto/coding",
          metric: {
            costBasis: "unknown",
            latencyMs: 100,
            reliability: 101,
          },
          updatedAt: new Date().toISOString(),
        }],
      }),
      "utf8",
    );
    await assert.rejects(
      () => new DurableModelRoutingMetricsStore(invalidMetric).load(),
      /reliability must be between 0 and 100/,
    );

    console.log("K.I.N.G.S. ADAPTIVE ROUTING → ATOMIC DURABLE SNAPSHOT: SUCCESS");
    console.log("K.I.N.G.S. ADAPTIVE ROUTING → RESTART RESTORE: SUCCESS");
    console.log("K.I.N.G.S. ADAPTIVE ROUTING → LATEST EVIDENCE WINS: SUCCESS");
    console.log("K.I.N.G.S. ADAPTIVE ROUTING → CORRUPT STATE FAIL-CLOSED: SUCCESS");
    console.log("TREE-KCM-DURABLE-MODEL-ROUTING-METRICS: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("TREE-KCM-DURABLE-MODEL-ROUTING-METRICS: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
