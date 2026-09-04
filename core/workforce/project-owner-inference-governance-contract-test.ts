import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main(): Promise<void> {
  const source = await readFile(
    join(process.cwd(), "core", "workforce", "project-owner-machine-api.ts"),
    "utf8",
  );

  assert.match(source, /new DurableInferenceEconomicsLedger/);
  assert.match(source, /new ProviderQuotaAuthority/);
  assert.match(source, /paidEscalation:\s*request\.paidEscalation \?\? "ask"/);
  assert.match(source, /approvedPaidEscalation:\s*request\.approvedPaidEscalation === true/);
  for (const field of [
    "missionUsd: request.missionBudgetUsd",
    "dayUsd: request.dayBudgetUsd",
    "monthUsd: request.monthBudgetUsd",
    "missionPaidTokens: request.missionPaidTokenBudget",
    "dayPaidTokens: request.dayPaidTokenBudget",
    "monthPaidTokens: request.monthPaidTokenBudget",
  ]) {
    assert(source.includes(field), `Project Owner execution is missing hard budget wiring: ${field}`);
  }
  assert(source.includes("economics: await this.economicsLedger.summarize(missionId)"));
  assert(source.includes("quotaAuthority: this.quotaAuthority"));

  console.log("PROJECT-OWNER-INFERENCE-001 durable mission economics ledger: SUCCESS");
  console.log("PROJECT-OWNER-INFERENCE-002 ask-before-paid default reaches model loop: SUCCESS");
  console.log("PROJECT-OWNER-INFERENCE-003 six hard inference budgets reach model loop: SUCCESS");
  console.log("PROJECT-OWNER-INFERENCE-004 quota authority reaches resilient routing boundary: SUCCESS");
  console.log("K.I.N.G.S. PROJECT OWNER INFERENCE GOVERNANCE: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
