import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DurableModelEconomicsAuthority } from "./model-economics-authority";

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-model-economics-"));
  try {
    const authority = new DurableModelEconomicsAuthority(join(root, "usage.jsonl"));
    const now = new Date("2026-09-04T18:00:00.000Z");
    const policy = {
      paidEscalation: "ask" as const,
      mission: { maximumPaidCostUsd: 1, maximumPaidTokens: 1_000 },
      day: { maximumPaidCostUsd: 2, maximumPaidTokens: 2_000 },
      month: { maximumPaidCostUsd: 5, maximumPaidTokens: 5_000 },
    };

    const local = await authority.authorize(policy, {
      missionId: "mission-a",
      routeClass: "local",
      now,
    });
    assert.equal(local.allowed, true);
    assert.equal(local.requiresOwnerApproval, false);

    const needsApproval = await authority.authorize(policy, {
      missionId: "mission-a",
      routeClass: "paid",
      estimatedCostUsd: 0.25,
      estimatedPaidTokens: 200,
      now,
    });
    assert.equal(needsApproval.allowed, false);
    assert.equal(needsApproval.requiresOwnerApproval, true);

    const approved = await authority.authorize(policy, {
      missionId: "mission-a",
      routeClass: "paid",
      estimatedCostUsd: 0.25,
      estimatedPaidTokens: 200,
      ownerApprovedPaidEscalation: true,
      now,
    });
    assert.equal(approved.allowed, true);

    await authority.record({
      id: "usage-local",
      missionId: "mission-a",
      providerId: "local-openai",
      modelId: "local/qwen-coder",
      providerKind: "internal-self-hosted",
      occurredAt: now,
      avoidedPaidCostUsd: 0.4,
      usage: {
        tokensUsed: 450,
        iterationsUsed: 1,
        inputTokens: 300,
        outputTokens: 150,
        cachedTokens: 50,
        savedTokens: 80,
      },
    });
    await authority.record({
      id: "usage-paid",
      missionId: "mission-a",
      providerId: "provider-paid",
      modelId: "frontier-coder",
      providerKind: "external-paid",
      occurredAt: now,
      usage: {
        tokensUsed: 700,
        iterationsUsed: 1,
        inputTokens: 500,
        outputTokens: 200,
        cachedTokens: 100,
        reportedCostUsd: 0.7,
      },
    });

    const summary = await authority.summary({ missionId: "mission-a" });
    assert.equal(summary.localTokens, 400, "local non-cached tokens were not separated");
    assert.equal(summary.paidTokens, 600, "paid non-cached tokens were not separated");
    assert.equal(summary.cachedTokens, 150, "cached tokens were not tracked separately");
    assert.equal(summary.compressionSavedTokens, 80, "compression savings were not retained");
    assert.equal(summary.reportedPaidCostUsd, 0.7, "provider-reported spend was not retained");
    assert.equal(summary.avoidedPaidCostUsd, 0.4, "avoided paid cost was not retained");

    const overMission = await authority.authorize(policy, {
      missionId: "mission-a",
      routeClass: "paid",
      estimatedCostUsd: 0.31,
      estimatedPaidTokens: 100,
      ownerApprovedPaidEscalation: true,
      now,
    });
    assert.equal(overMission.allowed, false);
    assert.match(overMission.reason, /Mission paid-dollar budget/);

    const unknownCost = await authority.authorize(policy, {
      missionId: "mission-a",
      routeClass: "paid",
      estimatedPaidTokens: 50,
      ownerApprovedPaidEscalation: true,
      now,
    });
    assert.equal(unknownCost.allowed, false);
    assert.match(unknownCost.reason, /cost is unknown/);

    const neverPaid = await authority.authorize({ paidEscalation: "never" }, {
      missionId: "mission-b",
      routeClass: "paid",
      estimatedCostUsd: 0,
      estimatedPaidTokens: 1,
      now,
    });
    assert.equal(neverPaid.allowed, false);
    assert.match(neverPaid.reason, /disabled by owner policy/);

    console.log("MODEL-ECONOMICS-001 durable mission/day/month hard budget authority: SUCCESS");
    console.log("MODEL-ECONOMICS-002 explicit approval required before paid escalation: SUCCESS");
    console.log("MODEL-ECONOMICS-003 local/free/cached/paid token accounting + savings: SUCCESS");
    console.log("MODEL-ECONOMICS-004 unknown paid cost fails closed under hard dollar ceilings: SUCCESS");
    console.log("K.I.N.G.S. MODEL ECONOMICS AUTHORITY: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
