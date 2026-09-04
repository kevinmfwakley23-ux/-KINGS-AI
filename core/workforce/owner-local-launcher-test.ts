import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

async function main(): Promise<void> {
  const path = join(process.cwd(), "ui", "project-owner", "start-local.sh");
  const syntax = spawnSync("bash", ["-n", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  assert.equal(
    syntax.status,
    0,
    `phone/LAN launcher shell syntax is invalid: ${syntax.stderr || syntax.stdout}`,
  );

  const source = await readFile(path, "utf8");
  assert.match(source, /KINGS_CODING_MACHINE_BIND:-0\.0\.0\.0/);
  assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /KINGS_OWNER_TOKEN/);
  assert.match(source, /owner-token/);
  assert.match(source, /chmod 600/);
  assert.match(source, /Android \/ LAN pairing:/);
  assert.match(source, /\?token=/);
  assert.match(source, /gateway-first; local Ollama is optional fallback only/);
  assert.doesNotMatch(
    source,
    /Model:\s*qwen2\.5-coder:1\.5b/,
    "launcher must not present one fallback model as the active K.I.N.G.S. routing fabric",
  );

  console.log("K.I.N.G.S. LOCAL LAUNCHER → SHELL SYNTAX: SUCCESS");
  console.log("K.I.N.G.S. LOCAL LAUNCHER → PERSISTENT OWNER TOKEN: SUCCESS");
  console.log("K.I.N.G.S. LOCAL LAUNCHER → ANDROID PAIRING URL: SUCCESS");
  console.log("TREE-KCM-OWNER-LOCAL-LAUNCHER: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-LOCAL-LAUNCHER: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
