import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DurableInferenceEconomicsLedger,
  InferenceBudgetAuthority,
} from "./inference-economics";

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-inference-economics-"));
  try {
    const ledger = new DurableInferenceEconomicsLedger(join(root, "economics.jsonl"));
    const now = "2026-09-04T17:20:00.000Z";

    await ledger.record({
      requestId: "local-1",
      missionId: "mission-a",
      providerId: "local-openai",
      modelId: "qwen-local",
      completedAt: now,
      routeClass: "local",
      inputTokens: 700,
      outputTokens: 300,
      cachedTokens: 200,
      totalTokens: 1_000,
      paidTokens: 0,
      actualCostUsd: 0,
      avoidedCostUsd: 0.012,
    });
    await ledger.record({
      requestId: "free-1",
      missionId: "mission-a",
      providerId: "openrouter",
      modelId: "free/coder",
      completedAt: now,
      routeClass: "free",
      inputTokens: 600,
      outputTokens: 400,
      cachedTokens: 0,
      totalTokens: 1_000,
      paidTokens: 0,
      actualCostUsd: 0,
      avoidedCostUsd: 0.018,
    });
    await ledger.record({
      requestId: "paid-1",
      missionId: "mission-a",
      providerId: "paid-provider",
      modelId: "frontier-coder",
      completedAt: now,
      routeClass: "paid",
      inputTokens: 500,
      outputTokens: 500,
      cachedTokens: 100,
      totalTokens: 1_000,
      paidTokens: 1_000,
      actualCostUsd: 0.04,
    });

    const summary = await ledger.summarize("mission-a");
    assert.equal(summary.localTokens, 1_000);
    assert.equal(summary.freeTokens, 1_000);
    assert.equal(summary.paidTokens, 1_000);
    assert.equal(summary.cachedTokens, 300);
    assert.equal(summary.tokensAvoidingPaidRoutes, 2_000);
    assert(Math.abs(summary.actualCostUsd - 0.04) < 1e-9);
    assert(Math.abs(summary.avoidedCostUsd - 0.03) < 1e-9);

    const askAuthority = new InferenceBudgetAuthority(ledger, {
      missionUsd: 0.10,
      dayUsd: 0.12,
      monthUsd: 0.50,
      missionPaidTokens: 2_000,
      dayPaidTokens: 2_500,
      monthPaidTokens: 10_000,
      paidEscalation: "ask",
    });

    const approval = await askAuthority.assess({
      missionId: "mission-a",
      providerId: "paid-provider",
      modelId: "frontier-coder-2",
      routeClass: "paid",
      estimatedCostUsd: 0.02,
      estimatedPaidTokens: 500,
      at: now,
    });
    assert.equal(approval.status, "approval-required", "paid escalation should stop for owner approval before spend");

    const approved = await askAuthority.assess({
      missionId: "mission-a",
      providerId: "paid-provider",
      modelId: "frontier-coder-2",
      routeClass: "paid",
      estimatedCostUsd: 0.02,
      estimatedPaidTokens: 500,
      approvedPaidEscalation: true,
      at: now,
    });
    assert.equal(approved.status, "allowed");
    assert.equal(approved.projected.missionPaidTokens, 1_500);

    const overTokenBudget = await askAuthority.assess({
      missionId: "mission-a",
      providerId: "paid-provider",
      modelId: "frontier-coder-3",
      routeClass: "paid",
      estimatedCostUsd: 0.02,
      estimatedPaidTokens: 1_500,
      approvedPaidEscalation: true,
      at: now,
    });
    assert.equal(overTokenBudget.status, "denied");
    assert.match(overTokenBudget.reason, /missionPaidTokens/);

    const unknownCost = await askAuthority.assess({
      missionId: "mission-a",
      providerId: "paid-provider",
      modelId: "unknown-price",
      routeClass: "paid",
      estimatedPaidTokens: 100,
      at: now,
    });
    assert.equal(unknownCost.status, "approval-required");
    assert.match(unknownCost.reason, /cost is unknown/i);

    const local = await askAuthority.assess({
      missionId: "mission-a",
      providerId: "local-openai",
      modelId: "qwen-local",
      routeClass: "local",
      at: now,
    });
    assert.equal(local.status, "allowed");

    console.log("INFERENCE-ECONOMICS-001 local/free/cached/paid accounting + savings: SUCCESS");
    console.log("INFERENCE-ECONOMICS-002 mission/day/month hard budgets: SUCCESS");
    console.log("INFERENCE-ECONOMICS-003 ask-before-paid escalation: SUCCESS");
    console.log("INFERENCE-ECONOMICS-004 unknown paid cost fails closed for approval: SUCCESS");
    console.log("K.I.N.G.S. INFERENCE ECONOMICS: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
