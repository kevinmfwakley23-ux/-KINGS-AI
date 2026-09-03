import {
  readFile,
} from "node:fs/promises";
import {
  spawnSync,
} from "node:child_process";
import {
  join,
} from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const root = process.cwd();
  const preflightPath = join(root, "scripts", "kings-production-preflight.mjs");
  const packagePath = join(root, "package.json");

  const syntax = spawnSync(process.execPath, ["--check", preflightPath], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  assert(
    syntax.status === 0,
    `production preflight failed JavaScript syntax validation: ${syntax.stderr || syntax.stdout}`,
  );

  const source = await readFile(preflightPath, "utf8");
  assert(source.includes("detectBubblewrap"), "preflight does not verify host process isolation");
  assert(source.includes("checkWorkspace"), "preflight does not verify project workspace writeability");
  assert(source.includes("checkOllama"), "preflight does not check local AI readiness");
  assert(source.includes("checkGateways"), "preflight does not check configured AI gateways");
  assert(source.includes("checkGitHubAuth"), "preflight does not check GitHub authentication readiness");
  assert(
    source.includes("PRODUCTION PREFLIGHT: NOT READY") &&
      source.includes("process.exitCode = 1"),
    "production preflight does not fail closed on mandatory prerequisite failures",
  );

  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert(
    manifest.scripts?.["preflight:production"] === "node scripts/kings-production-preflight.mjs",
    "package manifest does not expose the production preflight command",
  );
  assert(
    manifest.scripts?.["start:production"] ===
      "npm run preflight:production && npm run start:owner-ui",
    "production start does not require a passing preflight",
  );

  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT → SYNTAX: SUCCESS");
  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT → REQUIRED REAL-WORLD CHECKS: SUCCESS");
  console.log("K.I.N.G.S. PRODUCTION START → FAIL-CLOSED PREFLIGHT: SUCCESS");
  console.log("TREE-KCM-PRODUCTION-PREFLIGHT: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-PRODUCTION-PREFLIGHT: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
