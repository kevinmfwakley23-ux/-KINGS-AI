import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

function temporaryMissionStore() {
  return join(
    tmpdir(),
    `kings-owner-console-${process.pid}-${randomUUID()}.json`,
  );
}

function startOwner({ port, bind, token, missionStore = temporaryMissionStore() }) {
  const env = {
    ...process.env,
    KINGS_CODING_MACHINE_PORT: String(port),
    KINGS_CODING_MACHINE_BIND: bind,
    KINGS_CONNECTOR_HEALTH_TIMEOUT_MS: "40",
    KINGS_CODING_MACHINE_WORKSPACE: rootPath,
    KINGS_OWNER_MISSION_STORE: missionStore,
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
  return { child, missionStore, output: () => output };
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

async function cleanupMissionStore(path) {
  await rm(path, { force: true });
}

async function assertRemoteStartupRequiresToken() {
  const port = await freePort();
  const run = startOwner({ port, bind: "0.0.0.0", token: undefined });
  try {
    const [code] = await once(run.child, "exit");
    assert.notEqual(code, 0, "non-loopback owner console must fail closed without an owner token");
    assert.match(run.output(), /refuses non-loopback binding without KINGS_CODING_MACHINE_TOKEN/);
  } finally {
    await cleanupMissionStore(run.missionStore);
  }
}

async function assertLoopbackRemainsLocalAndUsable() {
  const port = await freePort();
  const missionStore = temporaryMissionStore();
  const run = startOwner({
    port,
    bind: "127.0.0.1",
    token: undefined,
    missionStore,
  });
  let missionId;
  try {
    await waitForHealth(port, run.child, run.output);
    const base = `http://127.0.0.1:${port}`;
    const response = await fetch(`${base}/api/status`, { cache: "no-store" });
    assert.equal(response.status, 200, "loopback owner console must remain usable without remote credentials");
    const body = await response.json();
    assert.equal(body.ok, true);

    const engineering = await fetch(`${base}/api/engineering`, { cache: "no-store" });
    assert.equal(engineering.status, 200, "loopback owner must be able to inspect the fixed engineering control surface");
    const engineeringBody = await engineering.json();
    assert.equal(engineeringBody.ok, true);
    assert.equal(engineeringBody.workspace, rootPath, "engineering workspace must come from server configuration");
    assert.deepEqual(engineeringBody.allowedActions, ["readiness", "verify"], "console must expose only the fixed engineering actions");
    assert.equal(engineeringBody.controlReady, true, "compiled owner engineering worker must exist after the package test build");
    assert.equal(engineeringBody.job, null, "inspecting engineering state must never start a job");

    const initialMissions = await fetch(`${base}/api/missions`, { cache: "no-store" });
    assert.equal(initialMissions.status, 200, "loopback owner must be able to inspect persistent mission state");
    const initialMissionBody = await initialMissions.json();
    assert.deepEqual(initialMissionBody.missions, [], "fresh owner mission store must start empty");

    const unconfirmed = await fetch(`${base}/api/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerVision: "Build a verified mobile-first collector workbench." }),
    });
    assert.equal(unconfirmed.status, 400, "mission creation must require explicit owner action confirmation");
    const unconfirmedBody = await unconfirmed.json();
    assert.equal(unconfirmedBody.error, "mission_creation_confirmation_required");

    const created = await fetch(`${base}/api/missions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kings-owner-action": "create-mission",
      },
      body: JSON.stringify({
        productName: "Collector Workbench",
        ownerVision: "Build a verified mobile-first collector workbench with inventory search, valuation context, and real build/test evidence before release.",
      }),
    });
    assert.equal(created.status, 201, "confirmed owner vision must create a persistent mission");
    const createdBody = await created.json();
    assert.equal(createdBody.ok, true);
    assert.equal(createdBody.mission.name, "Collector Workbench");
    assert.equal(createdBody.plan.approvedByHuman, true, "Build From This Vision must record explicit human approval");
    assert.equal(createdBody.plan.locked, true, "approved owner plan must be locked before task assembly");
    assert.ok(createdBody.tasks.length >= 8, "owner vision must create the real multi-stage product build task graph");
    assert.ok(createdBody.execution.runnableTaskIds.length >= 1, "created mission must expose runnable dependency state");
    missionId = createdBody.mission.id;

    const listed = await fetch(`${base}/api/missions`, { cache: "no-store" });
    const listedBody = await listed.json();
    assert.equal(listedBody.missions.length, 1, "created mission must be visible through mission control");
    assert.equal(listedBody.missions[0].mission.id, missionId);
  } finally {
    await stop(run.child);
  }

  const restartPort = await freePort();
  const restarted = startOwner({
    port: restartPort,
    bind: "127.0.0.1",
    token: undefined,
    missionStore,
  });
  try {
    await waitForHealth(restartPort, restarted.child, restarted.output);
    const restored = await fetch(`http://127.0.0.1:${restartPort}/api/missions`, { cache: "no-store" });
    assert.equal(restored.status, 200);
    const restoredBody = await restored.json();
    assert.equal(restoredBody.missions.length, 1, "owner mission must survive a full console process restart");
    assert.equal(restoredBody.missions[0].mission.id, missionId, "restart must preserve mission identity");
    assert.equal(restoredBody.missions[0].plan.locked, true, "restart must preserve locked approval state");
    assert.ok(restoredBody.missions[0].tasks.length >= 8, "restart must restore executable task graph");
  } finally {
    await stop(restarted.child);
    await cleanupMissionStore(missionStore);
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

    const anonymousMissions = await fetch(`${base}/api/missions`, { cache: "no-store" });
    assert.equal(anonymousMissions.status, 401, "remote mission state must be private to the authenticated owner");

    const anonymousMissionCreate = await fetch(`${base}/api/missions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kings-owner-action": "create-mission",
      },
      body: JSON.stringify({ ownerVision: "Build something unauthorized." }),
    });
    assert.equal(anonymousMissionCreate.status, 401, "anonymous callers must never create owner missions");

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

    const authenticatedMissions = await fetch(`${base}/api/missions`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(authenticatedMissions.status, 200, "authenticated owner must be able to inspect mission state");

    const wrongMissionConfirmation = await fetch(`${base}/api/missions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-kings-owner-action": "verify",
      },
      body: JSON.stringify({ ownerVision: "Build a mission." }),
    });
    assert.equal(wrongMissionConfirmation.status, 400, "engineering confirmation must not authorize mission creation");

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
    await cleanupMissionStore(run.missionStore);
  }
}

await assertRemoteStartupRequiresToken();
await assertLoopbackRemainsLocalAndUsable();
await assertRemoteAuthenticationLifecycle();
console.log("K.I.N.G.S. owner-console auth + persistent Talk-to-K.I.N.G.S. mission boundary: SUCCESS");
