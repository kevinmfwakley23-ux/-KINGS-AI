import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const royal = read("native-shell/royal.css");
const nativeHtml = read("native-shell/index.html");
const nativeApp = read("native-shell/app.js");
const owner = read("ui/project-owner/server.mjs");

// Match the approved Author's Forge family palette and theme architecture.
for (const token of ["--kings-bg:#f5f1e9", "--kings-panel:rgba(255,255,255,.86)", "--kings-gold:#b68a3f", "--kings-gold-bright:#d8b96f", "--kings-black:#111315"]) {
  assert.ok(royal.includes(token), `missing royal design token ${token}`);
}
assert.match(royal, /data-kings-theme="dark"/);
assert.match(royal, /linear-gradient\(118deg/);
assert.match(royal, /radial-gradient\(circle at 18% 9%/);
assert.match(royal, /\.kings-display/);
assert.match(royal, /\.kings-seal/);
assert.match(royal, /\.kings-theme-toggle/);

// Android and desktop owner surfaces must share the same royal token sheet.
assert.match(nativeHtml, /href="\.\/royal\.css"/);
assert.match(nativeHtml, /id="theme-toggle"/);
assert.match(nativeHtml, /OWNER COMMAND GATEWAY/);
assert.match(nativeHtml, /THE OUTER GATE/);
assert.match(nativeHtml, /ROYAL GUARD/);
assert.match(nativeApp, /const THEME_KEY = "kings-ui-theme"/);
assert.match(nativeApp, /document\.documentElement\.dataset\.kingsTheme/);
assert.match(nativeApp, /localStorage\.setItem\(THEME_KEY, next\)/);
assert.doesNotMatch(nativeApp, /localStorage\.setItem\([^\n]*(?:ownerToken|access)/i, "owner credentials must not be persisted by the themed native shell");

assert.match(owner, /readFileSync\(new URL\("\.\.\/\.\.\/native-shell\/royal\.css"/);
assert.match(owner, /Owner Command Palace/);
assert.match(owner, /THE MODEL COURT/);
assert.match(owner, /ROYAL LAW/);
assert.match(owner, /id="theme-toggle"/);
assert.match(owner, /data\.kingsTheme/);
assert.doesNotMatch(owner, /background:#0b0d12;color:#f3f5f7/, "legacy dark-admin skin must not return");

// Visual work must not weaken the already-verified remote owner boundary.
assert.match(owner, /remoteMode && ownerToken\.length < 24/);
assert.match(owner, /HttpOnly; Secure; SameSite=Strict/);
assert.match(owner, /timingSafeEqual/);
assert.match(owner, /authorization\.startsWith\("Bearer "\)/);

console.log("K.I.N.G.S. royal UI parity: SUCCESS");
