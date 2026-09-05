import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(join(process.cwd(), "package.json"), "utf8"),
  ) as {
    description?: string;
    scripts?: Record<string, string>;
  };

  assert.match(
    manifest.description ?? "",
    /Gateway-first governed AI coding machine/i,
    "package description must describe the real gateway-first runtime",
  );
  assert.doesNotMatch(
    manifest.description ?? "",
    /local-first/i,
    "package description must not advertise obsolete local-first routing",
  );
  assert.equal(
    manifest.scripts?.["start:phone"],
    "bash ui/project-owner/start-local.sh",
    "package manifest must expose the authenticated Android/LAN launcher",
  );
  assert.equal(
    manifest.scripts?.["start:production"],
    "npm run preflight:production && npm run start:owner-ui",
    "production startup must remain gated by production preflight",
  );
  assert.equal(
    manifest.scripts?.["verify:production:live"],
    "npm run check && npm run preflight:production && npm run check:gateway-live",
    "live production proof chain must remain deterministic + preflight + real gateway acceptance",
  );

  console.log("K.I.N.G.S. PACKAGE → GATEWAY-FIRST DESCRIPTION: SUCCESS");
  console.log("K.I.N.G.S. PACKAGE → PHONE LAUNCHER: SUCCESS");
  console.log("K.I.N.G.S. PACKAGE → PRODUCTION PREFLIGHT GATE: SUCCESS");
  console.log("TREE-KCM-PACKAGE-RUNTIME-CONTRACT: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-PACKAGE-RUNTIME-CONTRACT: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
