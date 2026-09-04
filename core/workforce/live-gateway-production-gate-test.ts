import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const root = process.cwd();
  const scriptPath = join(root, "scripts", "run-live-gateway-acceptance.sh");
  const standaloneWorkflowPath = join(root, ".github", "workflows", "live-production-verification.yml");
  const activeWorkflowPath = join(root, ".github", "workflows", "production-verification.yml");
  const packagePath = join(root, "package.json");

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

  const standaloneWorkflow = await readFile(standaloneWorkflowPath, "utf8");
  assert(
    standaloneWorkflow.includes("workflow_dispatch:"),
    "standalone live production workflow is not explicitly invokable",
  );
  assert(
    standaloneWorkflow.includes("npm run check") &&
      standaloneWorkflow.includes("npm run preflight:production"),
    "standalone live workflow does not require deterministic and production preflight gates",
  );
  assert(
    standaloneWorkflow.includes("bash scripts/run-live-gateway-acceptance.sh"),
    "standalone live workflow does not execute the real model-driven coding acceptance",
  );
  assert(
    standaloneWorkflow.includes("sudo apt-get install -y bubblewrap"),
    "standalone live workflow does not install the required host isolation boundary",
  );

  const activeWorkflow = await readFile(activeWorkflowPath, "utf8");
  assert(
    activeWorkflow.includes("live-production:") &&
      activeWorkflow.includes("needs: verify"),
    "active production workflow does not gate live production proof behind deterministic verification",
  );
  assert(
    activeWorkflow.includes("if: github.event_name == 'push'"),
    "active production workflow does not restrict secret-backed live execution to trusted pushes",
  );
  assert(
    activeWorkflow.includes("npm run preflight:production") &&
      activeWorkflow.includes("npm run check:gateway-live"),
    "active production workflow does not require real preflight and model-driven coding acceptance",
  );
  assert(
    activeWorkflow.includes("KINGS_OMNIROUTE_URL: ${{ secrets.KINGS_OMNIROUTE_URL }}") &&
      activeWorkflow.includes("KINGS_9ROUTER_URL: ${{ secrets.KINGS_9ROUTER_URL }}"),
    "active production workflow is not wired to real gateway configuration",
  );

  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert(
    manifest.scripts?.["check:gateway-live"] ===
      "npm run build:owner-ui && bash scripts/run-live-gateway-acceptance.sh",
    "package manifest does not expose the real live gateway acceptance",
  );
  assert(
    manifest.scripts?.["verify:production:live"] ===
      "npm run check && npm run preflight:production && npm run check:gateway-live",
    "package manifest does not expose the complete live production proof chain",
  );

  console.log("K.I.N.G.S. LIVE GATEWAY GATE → SHELL SYNTAX: SUCCESS");
  console.log("K.I.N.G.S. LIVE GATEWAY GATE → REAL CODING ACCEPTANCE: SUCCESS");
  console.log("K.I.N.G.S. LIVE GATEWAY GATE → ACTIVE WORKFLOW CHAIN: SUCCESS");
  console.log("K.I.N.G.S. LIVE GATEWAY GATE → PACKAGE COMMANDS: SUCCESS");
  console.log("TREE-KCM-LIVE-PRODUCTION-GATE: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-LIVE-PRODUCTION-GATE: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
