import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const rootPath = resolve(fileURLToPath(root));

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an owner-console test port."));
        return;
      }
      const { port } = address;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

function startOwner({ port, bind, token }) {
  const env = {
    ...process.env,
    KINGS_CODING_MACHINE_PORT: String(port),
    KINGS_CODING_MACHINE_BIND: bind,
    KINGS_CONNECTOR_HEALTH_TIMEOUT_MS: "40",
    KINGS_CODING_MACHINE_WORKSPACE: rootPath,
  };
  if (token === undefined) delete env.KINGS_CODING_MACHINE_TOKEN;
  else env.KINGS_CODING_MACHINE_TOKEN = token;

  const child = spawn(process.execPath, ["ui/project-owner/server.mjs"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  return { child, output: () => output };
}

async function waitForHealth(port, child, output) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Owner console exited before becoming healthy.\n${output()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: "no-store" });
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  throw new Error(`Timed out waiting for owner-console health.\n${output()}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill();
  const timeout = setTimeout(() => child.kill(), 2_000);
  timeout.unref?.();
  await once(child, "exit");
  clearTimeout(timeout);
}

async function assertRemoteStartupRequiresToken() {
  const port = await freePort();
  const run = startOwner({ port, bind: "0.0.0.0", token: undefined });
  const [code] = await once(run.child, "exit");
  assert.notEqual(code, 0, "non-loopback owner console must fail closed without an owner token");
  assert.match(run.output(), /refuses non-loopback binding without KINGS_CODING_MACHINE_TOKEN/);
}

async function assertLoopbackRemainsLocalAndUsable() {
  const port = await freePort();
  const run = startOwner({ port, bind: "127.0.0.1", token: undefined });
  try {
    await waitForHealth(port, run.child, run.output);
    const response = await fetch(`http://127.0.0.1:${port}/api/status`, { cache: "no-store" });
    assert.equal(response.status, 200, "loopback owner console must remain usable without remote credentials");
    const body = await response.json();
    assert.equal(body.ok, true);

    const engineering = await fetch(`http://127.0.0.1:${port}/api/engineering`, { cache: "no-store" });
    assert.equal(engineering.status, 200, "loopback owner must be able to inspect the fixed engineering control surface");
    const engineeringBody = await engineering.json();
    assert.equal(engineeringBody.ok, true);
    assert.equal(engineeringBody.workspace, rootPath, "engineering workspace must come from server configuration");
    assert.deepEqual(engineeringBody.allowedActions, ["readiness", "verify"], "console must expose only the fixed engineering actions");
    assert.equal(engineeringBody.controlReady, true, "compiled owner engineering worker must exist after the package test build");
    assert.equal(engineeringBody.job, null, "inspecting engineering state must never start a job");
  } finally {
    await stop(run.child);
  }
}

async function assertRemoteAuthenticationLifecycle() {
  const port = await freePort();
  const token = "kings-owner-test-token-0123456789abcdef";
  const run = startOwner({ port, bind: "0.0.0.0", token });
  try {
    await waitForHealth(port, run.child, run.output);
    const base = `http://127.0.0.1:${port}`;

    const health = await fetch(`${base}/health`, { cache: "no-store" });
    assert.equal(health.status, 200, "health must remain minimally observable for infrastructure probes");

    const anonymous = await fetch(`${base}/api/status`, { cache: "no-store" });
    assert.equal(anonymous.status, 401, "remote owner APIs must reject anonymous requests");
    assert.match(anonymous.headers.get("www-authenticate") ?? "", /^Bearer /);

    const anonymousEngineering = await fetch(`${base}/api/engineering`, { cache: "no-store" });
    assert.equal(anonymousEngineering.status, 401, "remote engineering state must be private to authenticated owner sessions");

    const anonymousVerify = await fetch(`${base}/api/engineering/verify`, {
      method: "POST",
      headers: { "x-kings-owner-action": "verify" },
    });
    assert.equal(anonymousVerify.status, 401, "anonymous callers must never start governed repository verification");

    const wrongBootstrap = await fetch(`${base}/?access=wrong-owner-token`, { redirect: "manual" });
    assert.equal(wrongBootstrap.status, 401, "wrong bootstrap credentials must not create a browser session");

    const bootstrap = await fetch(`${base}/?access=${encodeURIComponent(token)}`, { redirect: "manual" });
    assert.equal(bootstrap.status, 303, "correct one-time bootstrap must redirect to a clean URL");
    assert.equal(bootstrap.headers.get("location"), "/");
    const setCookie = bootstrap.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /__Host-kings_owner_access=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.doesNotMatch(setCookie, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "session cookie must not contain the reusable owner token");
    const sessionCookie = setCookie.split(";", 1)[0];

    const session = await fetch(`${base}/api/status`, {
      cache: "no-store",
      headers: { cookie: sessionCookie },
    });
    assert.equal(session.status, 200, "secure bootstrap session must authorize owner API access");

    const bearer = await fetch(`${base}/api/status`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(bearer.status, 200, "non-browser clients must be able to use the owner bearer token");

    const engineeringState = await fetch(`${base}/api/engineering`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(engineeringState.status, 200, "authenticated owner must be able to inspect governed engineering state");
    const engineeringBody = await engineeringState.json();
    assert.deepEqual(engineeringBody.allowedActions, ["readiness", "verify"]);
    assert.equal(engineeringBody.job, null);

    const noConfirmation = await fetch(`${base}/api/engineering/verify`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(noConfirmation.status, 400, "authenticated verify must still require explicit fixed-action confirmation");
    const noConfirmationBody = await noConfirmation.json();
    assert.equal(noConfirmationBody.error, "engineering_action_confirmation_required");

    const wrongConfirmation = await fetch(`${base}/api/engineering/verify`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-kings-owner-action": "readiness",
      },
    });
    assert.equal(wrongConfirmation.status, 400, "confirmation for one fixed action must not authorize a different action");

    const afterRejectedStarts = await fetch(`${base}/api/engineering`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
    const afterBody = await afterRejectedStarts.json();
    assert.equal(afterBody.job, null, "rejected engineering start attempts must not spawn background validation jobs");
  } finally {
    await stop(run.child);
  }
}

await assertRemoteStartupRequiresToken();
await assertLoopbackRemainsLocalAndUsable();
await assertRemoteAuthenticationLifecycle();
console.log("K.I.N.G.S. owner-console remote authentication + fixed engineering boundary: SUCCESS");
