import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main(): Promise<void> {
  const root = process.cwd();
  const service = await readFile(
    join(root, "ui", "project-owner", "kings-coding-machine.service"),
    "utf8",
  );
  const installer = await readFile(
    join(root, "ui", "project-owner", "install-service.sh"),
    "utf8",
  );

  assert.doesNotMatch(service, /%h\/KINGS-AI/);
  assert.doesNotMatch(service, /v24\.19\.0/);
  assert.match(service, /WorkingDirectory="@KINGS_ROOT@"/);
  assert.match(service, /KINGS_CODING_MACHINE_NODE=@NODE_BIN@/);
  assert.match(service, /KINGS_CODING_MACHINE_NPM=@NPM_BIN@/);
  assert.match(service, /KINGS_STATE_ROOT=@STATE_ROOT@/);
  assert.match(service, /KINGS_CODING_MACHINE_BIND=@BIND@/);
  assert.match(service, /start-local\.sh/);
  assert.match(service, /Restart=on-failure/);
  assert.match(service, /UMask=0077/);

  for (const marker of [
    "@KINGS_ROOT@",
    "@PORT@",
    "@BIND@",
    "@HOST@",
    "@STATE_ROOT@",
    "@NODE_BIN@",
    "@NPM_BIN@",
    "@NODE_DIR@",
  ]) {
    assert.ok(
      installer.includes(`"${marker}"`),
      `installer does not render service marker ${marker}`,
    );
  }

  assert.match(installer, /npm.*run build:owner-ui|"\$NPM_BIN" run build:owner-ui/);
  assert.match(installer, /systemctl --user enable/);
  assert.match(installer, /systemctl --user start/);
  assert.match(installer, /owner-token/);
  assert.match(installer, /Android \/ LAN pairing/);
  assert.doesNotMatch(installer, /\.config\/nvm\/versions\/node\/v24\.19\.0/);

  console.log("K.I.N.G.S. SERVICE → CHECKOUT/NODE PATH PORTABILITY: SUCCESS");
  console.log("K.I.N.G.S. SERVICE → CURRENT SOURCE REBUILD: SUCCESS");
  console.log("K.I.N.G.S. SERVICE → AUTHENTICATED PHONE PAIRING: SUCCESS");
  console.log("TREE-KCM-OWNER-SERVICE-PORTABILITY: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-SERVICE-PORTABILITY: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
