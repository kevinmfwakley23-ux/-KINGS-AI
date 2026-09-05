import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const config = JSON.parse(read("src-tauri/tauri.conf.json"));
const android = JSON.parse(read("src-tauri/tauri.android.conf.json"));
const cargo = read("src-tauri/Cargo.toml");
const app = read("native-shell/app.js");
const shell = read("native-shell/index.html");
const workflow = read(".github/workflows/android-native.yml");
const gitignore = read(".gitignore");

assert.equal(config.productName, "K.I.N.G.S. AI");
assert.equal(config.version, "1.0.0");
assert.equal(config.identifier, "ai.kings.owner");
assert.equal(config.build?.frontendDist, "../native-shell");
assert.equal(android.bundle?.android?.minSdkVersion, 24, "Android package must remain installable on Android 7+");

for (const csp of [config.app?.security?.csp, android.app?.security?.csp]) {
  assert.equal(typeof csp, "string");
  assert.match(csp, /connect-src[^;]*https:/, "native shell may connect to trusted HTTPS owner hosts");
  assert.match(csp, /navigate-to\s+https:/, "native navigation must remain HTTPS-only");
  assert.doesNotMatch(csp, /navigate-to[^;]*http:/, "plain HTTP remote navigation must stay forbidden");
}

assert.match(cargo, /tauri-build\s*=\s*\{\s*version\s*=\s*"=2\.6\.3"/);
assert.match(cargo, /tauri\s*=\s*\{\s*version\s*=\s*"=2\.11\.5"/);
assert.match(cargo, /crate-type\s*=\s*\["staticlib",\s*"cdylib",\s*"rlib"\]/, "mobile-compatible library crate types must remain enabled");

assert.match(app, /const STORAGE_KEY = "kings-owner-origin";/);
assert.match(app, /parsed\.protocol !== "https:"/, "owner host normalization must reject non-HTTPS URLs");
assert.match(app, /value\.length < 24/, "native bootstrap must enforce the owner-token floor");
assert.match(app, /bootstrap\.searchParams\.set\("access", token\)/, "native client must use the one-time server bootstrap contract");
assert.match(app, /tokenInput\.value = "";\s*navigate\(bootstrap\.href\)/s, "token input must be erased before leaving the gateway shell");
assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*(?:token|access)/i, "the reusable owner token must never be persisted to localStorage");
assert.match(shell, /autocomplete="current-password"|autocomplete="off"|autocomplete="new-password"/, "token entry must declare browser autofill behavior explicitly");

for (const ignored of ["src-tauri/gen/", "src-tauri/target/", "*.jks", "*.keystore", "keystore.properties"]) {
  assert.ok(gitignore.includes(ignored), `Android generated/signing state must stay ignored: ${ignored}`);
}

assert.match(workflow, /TAURI_CLI_VERSION:\s*"2\.11\.4"/);
assert.match(workflow, /ANDROID_NDK_VERSION:\s*"27\.0\.12077973"/);
assert.match(workflow, /ANDROID_PLATFORM:\s*"android-36"/);
assert.match(workflow, /cargo tauri android init --ci --skip-targets-install/);
assert.match(workflow, /cargo tauri android build --debug --apk --ci/);
assert.match(workflow, /apksigner/);
assert.match(workflow, /sha256sum/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.match(workflow, /if-no-files-found:\s*error/);
assert.match(workflow, /development\/android-native-package-test\.mjs/, "the workflow must execute this packaging contract before native build work");

console.log("K.I.N.G.S. Android native packaging contract: SUCCESS");
