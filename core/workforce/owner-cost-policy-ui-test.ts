import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main(): Promise<void> {
  const html = await readFile(
    join(process.cwd(), "ui", "project-owner", "index.html"),
    "utf8",
  );

  for (const [value, label] of [
    ["economy", "Economy"],
    ["free-only", "Never Paid"],
    ["local-only", "Local Only"],
    ["quality", "Quality First"],
  ] as const) {
    assert(html.includes(`value="${value}"`), `owner UI is missing cost policy value ${value}`);
    assert(html.includes(`>${label}</b>`), `owner UI is missing cost policy label ${label}`);
  }
  assert(html.includes('id="maximum-route-cost"'), "owner UI is missing the hard per-route cost ceiling input");
  assert(html.includes("costPreference:economics.costPreference"), "Execute + Verify does not send the owner cost preference to Project Owner API");
  assert(html.includes("maximumEstimatedCost:economics.maximumEstimatedCost"), "Execute + Verify does not send the hard route-cost ceiling");
  assert(html.includes("unknown price is not treated as free"), "browser economics UI lost the unknown-cost honesty boundary");
  assert(html.includes("Hard boundary: paid routes cannot execute."), "Never Paid is not described as a hard boundary");
  assert(html.includes("Hard boundary: only internal/self-hosted inference."), "Local Only is not described as a hard boundary");

  console.log("OWNER-COST-UI-001 Economy / Never Paid / Local Only / Quality First: SUCCESS");
  console.log("OWNER-COST-UI-002 hard route-cost ceiling reaches execution API: SUCCESS");
  console.log("OWNER-COST-UI-003 unknown-price honesty boundary: SUCCESS");
  console.log("K.I.N.G.S. OWNER COST POLICY UI: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
