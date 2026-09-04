import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const root = process.cwd();
  const scriptPath = join(root, "scripts", "run-live-gateway-acceptance.sh");
  const workflowPath = join(root, ".github", "workflows", "live-production-verification.yml");

  const syntax = spawnSync("bash", ["-n", scriptPath], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  assert(
    syntax.status === 0,
    `live gateway acceptance runner has invalid shell syntax: ${syntax.stderr || syntax.stdout}`,
  );

  const script = await readFile(scriptPath, "utf8");
  assert(
    script.includes("project-owner-model-driven-execution-test.ts"),
    "live gateway runner does not execute the real owner model-driven coding acceptance",
  );
  assert(
    script.includes("KINGS_OMNIROUTE_URL") &&
      script.includes("KINGS_9ROUTER_URL") &&
      script.includes("KINGS_AI_GATEWAYS_JSON"),
    "live gateway runner does not fail closed when no gateway is configured",
  );
  assert(script.includes("npx tsc"), "live gateway runner does not compile the acceptance test");
  assert(script.includes("node \"${emitted[0]}\""), "live gateway runner does not execute emitted acceptance code");

  const workflow = await readFile(workflowPath, "utf8");
  assert(workflow.includes("workflow_dispatch:"), "live production workflow is not explicitly invokable");
  assert(
    workflow.includes("npm run check") && workflow.includes("npm run preflight:production"),
    "live production workflow does not require deterministic and production preflight gates",
  );
  assert(
    workflow.includes("bash scripts/run-live-gateway-acceptance.sh"),
    "live production workflow does not execute the real model-driven coding acceptance",
  );
  assert(
    workflow.includes("sudo apt-get install -y bubblewrap"),
    "live production workflow does not install the required host isolation boundary",
  );

  console.log("K.I.N.G.S. LIVE GATEWAY GATE → SHELL SYNTAX: SUCCESS");
  console.log("K.I.N.G.S. LIVE GATEWAY GATE → REAL CODING ACCEPTANCE: SUCCESS");
  console.log("K.I.N.G.S. LIVE GATEWAY GATE → PREFLIGHT CHAIN: SUCCESS");
  console.log("TREE-KCM-LIVE-PRODUCTION-GATE: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-LIVE-PRODUCTION-GATE: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
