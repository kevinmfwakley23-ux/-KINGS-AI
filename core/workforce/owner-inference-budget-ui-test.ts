import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main(): Promise<void> {
  const html = await readFile(
    join(process.cwd(), "ui", "project-owner", "index.html"),
    "utf8",
  );

  for (const id of [
    "mission-budget-usd",
    "day-budget-usd",
    "month-budget-usd",
    "mission-paid-token-budget",
    "day-paid-token-budget",
    "month-paid-token-budget",
    "approve-paid-escalation",
    "inference-economics",
  ]) {
    assert(html.includes(`id="${id}"`), `owner UI is missing hard economics control/status ${id}`);
  }

  for (const field of [
    "missionBudgetUsd:economics.missionBudgetUsd",
    "dayBudgetUsd:economics.dayBudgetUsd",
    "monthBudgetUsd:economics.monthBudgetUsd",
    "missionPaidTokenBudget:economics.missionPaidTokenBudget",
    "dayPaidTokenBudget:economics.dayPaidTokenBudget",
    "monthPaidTokenBudget:economics.monthPaidTokenBudget",
    "paidEscalation:economics.paidEscalation",
    "approvedPaidEscalation:economics.approvedPaidEscalation",
  ]) {
    assert(html.includes(field), `Execute + Verify does not send ${field}`);
  }

  assert(html.includes("paidEscalation:'ask'"), "browser must default to ask-before-paid escalation");
  assert(
    html.includes("$('approve-paid-escalation').checked=false"),
    "paid escalation approval must be single-execution rather than sticky",
  );
  assert(html.includes("e.localTokens") && html.includes("e.freeTokens"));
  assert(html.includes("e.paidTokens") && html.includes("e.cachedTokens"));
  assert(html.includes("e.tokensAvoidingPaidRoutes"));
  assert(html.includes("e.actualCostUsd") && html.includes("e.avoidedCostUsd"));

  console.log("OWNER-INFERENCE-BUDGET-UI-001 mission/day/month dollar ceilings: SUCCESS");
  console.log("OWNER-INFERENCE-BUDGET-UI-002 mission/day/month paid-token ceilings: SUCCESS");
  console.log("OWNER-INFERENCE-BUDGET-UI-003 single-execution ask-before-paid approval: SUCCESS");
  console.log("OWNER-INFERENCE-BUDGET-UI-004 local/free/paid/cached + savings telemetry: SUCCESS");
  console.log("K.I.N.G.S. OWNER INFERENCE BUDGET UI: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
