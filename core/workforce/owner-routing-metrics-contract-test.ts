import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ProjectOwnerMachineServerController } from "../../ui/project-owner/server-contract";
import type { ModelRoutingMetrics } from "./model-routing";

async function main(): Promise<void> {
  const source = await readFile(
    join(process.cwd(), "ui", "project-owner", "server-contract.ts"),
    "utf8",
  );

  const availabilityMethod = source.match(
    /setLocalModelAvailability\(available: boolean\): void \{([\s\S]*?)\n  \}\n\n  routingMetricsSnapshot/,
  );
  assert.ok(
    availabilityMethod,
    "setLocalModelAvailability contract could not be located",
  );
  assert.doesNotMatch(
    availabilityMethod[1],
    /this\.metrics\.set\(/,
    "local health refresh must not overwrite adaptive routing evidence",
  );
  assert.match(availabilityMethod[1], /localModel\.identity\.available = available/);
  assert.match(availabilityMethod[1], /localAdapter\.descriptor\.available = available/);

  const originalA: ModelRoutingMetrics = {
    estimatedCost: 0.012,
    costBasis: "provider-reported",
    latencyMs: 480,
    reliability: 97,
  };
  const originalB: ModelRoutingMetrics = {
    costBasis: "unknown",
    latencyMs: 910,
    reliability: 83,
  };

  const controller = Object.create(
    ProjectOwnerMachineServerController.prototype,
  ) as ProjectOwnerMachineServerController;
  (controller as unknown as { metrics: Map<string, ModelRoutingMetrics> }).metrics =
    new Map([
      ["z-provider::model-b", originalB],
      ["a-provider::model-a", originalA],
    ]);

  const snapshot = controller.routingMetricsSnapshot();
  assert.deepEqual(
    snapshot.map(({ providerId, modelId }) => `${providerId}/${modelId}`),
    ["a-provider/model-a", "z-provider/model-b"],
    "routing metric snapshot must be deterministic",
  );
  assert.deepEqual(snapshot[0].metric, originalA);
  snapshot[0].metric.reliability = 1;
  assert.equal(
    originalA.reliability,
    97,
    "routing metric snapshots must not expose mutable internal metric objects",
  );

  console.log("K.I.N.G.S. ROUTING METRICS → LOCAL HEALTH PRESERVES LEARNING: SUCCESS");
  console.log("K.I.N.G.S. ROUTING METRICS → DETERMINISTIC DIAGNOSTIC SNAPSHOT: SUCCESS");
  console.log("TREE-KCM-OWNER-ROUTING-METRICS: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-ROUTING-METRICS: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
