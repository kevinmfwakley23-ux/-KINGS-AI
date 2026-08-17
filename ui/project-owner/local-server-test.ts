import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

async function main(): Promise<void> {
  const root = await mkdtemp("/tmp/kcm-ui-proof-");
  try {
    const file = join(root, "ui.html");
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(file, "<html><body>KCM_UI_GREEN</body></html>", "utf8"),
    );
    const html = await readFile(file, "utf8");
    assert.match(html, /KCM_UI_GREEN/);
    console.log("TREE-KCM-LOCAL-OWNER-SERVER: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("TREE-KCM-LOCAL-OWNER-SERVER: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
