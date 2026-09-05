import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
const logo = readFileSync(new URL("../../native-shell/kings-ai-official-logo.png", import.meta.url));
const expectedSha256 = "120a27fdad36b77eb9f0eae0e0e065c44d93eb57ed0aa3afd94e36d1ef04b1f0";

assert.equal(
  createHash("sha256").update(logo).digest("hex"),
  expectedSha256,
  "owner console must use the locked official K.I.N.G.S. AI brand asset",
);
assert.match(source, /readFileSync\(officialLogoPath\)/, "owner console must load the tracked logo from disk rather than an external URL");
assert.match(source, /href="\/assets\/kings-ai-official-logo\.png"/, "owner console favicon must use the official logo");
assert.match(source, /class="brand-logo" src="\/assets\/kings-ai-official-logo\.png"/, "owner console header must display the official logo");
assert.match(source, /img-src 'self' data:/, "owner console CSP must explicitly permit same-origin branding assets");

const authBoundary = source.indexOf("const authorization = authorizeOwnerRequest(req, url);");
const assetBoundary = source.indexOf('url.pathname === "/assets/kings-ai-official-logo.png"');
assert.ok(authBoundary >= 0 && assetBoundary > authBoundary, "official logo HTTP route must remain behind the owner-authentication boundary");
assert.doesNotMatch(source, /https?:\/\/[^\s"']+kings-ai-official-logo/i, "owner console must not fetch the official crest from an external host");

console.log("K.I.N.G.S. owner console official brand boundary: SUCCESS");
