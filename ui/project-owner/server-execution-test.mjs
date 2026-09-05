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
        reject(new Error("Could not allocate owner execution test port."));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function statePaths() {
  const base = join(tmpdir(), `kings-owner-execution-http-${process.pid}-${randomUUID()}`);
  return {
    base,
    missionStore: join(base, "missions.json"),
    contextStore: join(base, "context.json"),
  };
}

function startOwner({ port, bind = "127.0.0.1", token, state }) {
  const env = {
    ...process.env,
    KINGS_CODING_MACHINE_PORT: String(port),
    KINGS_CODING_MACHINE_BIND: bind,
    KINGS_CONNECTOR_HEALTH_TIMEOUT_MS: "30",
    KINGS_CODING_MACHINE_WORKSPACE: rootPath,
    KINGS_OWNER_MISSION_STORE: state.missionStore,
    KINGS_OWNER_CONTEXT_STORE: state.contextStore,
  };
  for (const key of [
    "KINGS_OMNIROUTE_BASE_URL",
    "KINGS_OMNIROUTE_HOSTPORT",
    "KINGS_OMNIROUTE_MODELS",
    "KINGS_OMNIROUTE_API_KEY",
    "KINGS_9ROUTER_BASE_URL",
    "KINGS_9ROUTER_HOSTPORT",
    "KINGS_9ROUTER_MODELS",
    "KINGS_9ROUTER_API_KEY",
    "KINGS_OLLAMA_BASE_URL",
    "KINGS_OLLAMA_MODEL",
    "KINGS_OLLAMA_MODELS",
  ]) delete env[key];
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

async function waitForHealth(port, run) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (run.child.exitCode !== null) throw new Error(`Owner console exited early.\n${run.output()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: "no-store" });
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  throw new Error(`Timed out waiting for owner console.\n${run.output()}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}

async function pollJob(base, headers = {}) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/mission-execution`, { cache: "no-store", headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    if (body.job && body.job.status !== "running") return body;
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  throw new Error("Mission execution job did not settle in time.");
}

async function loopbackExecutionBoundary() {
  const port = await freePort();
  const state = statePaths();
  const run = startOwner({ port, state });
  try {
    await waitForHealth(port, run);
    const base = `http://127.0.0.1:${port}`;

    const created = await fetch(`${base}/api/missions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kings-owner-action": "create-mission",
      },
      body: JSON.stringify({
        productName: "Execution Boundary Test",
        ownerVision: "Inspect this repository and perform governed implementation only when a configured provider can produce real work.",
      }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    const missionId = createdBody.mission.id;

    const unconfirmed = await fetch(`${base}/api/missions/${encodeURIComponent(missionId)}/execute`, {
      method: "POST",
    });
    assert.equal(unconfirmed.status, 400, "mission execution must require explicit fixed owner confirmation");
    assert.equal((await unconfirmed.json()).error, "mission_execution_confirmation_required");

    const routeState = await fetch(`${base}/api/mission-execution`, { cache: "no-store" });
    const routeBody = await routeState.json();
    assert.deepEqual(routeBody.providerOrder, ["omniroute", "9router", "ollama-internal"]);
    assert.deepEqual(routeBody.availableProviders, [], "no provider must be fabricated when none is configured");
    assert.equal(routeBody.workspace, rootPath, "mission executor workspace must be server-configured");

    const started = await fetch(`${base}/api/missions/${encodeURIComponent(missionId)}/execute`, {
      method: "POST",
      headers: { "x-kings-owner-action": "execute-mission" },
    });
    assert.equal(started.status, 202, "confirmed mission execution must start asynchronously");
    const startedBody = await started.json();
    assert.equal(startedBody.job.missionId, missionId);
    assert.equal(startedBody.job.workspace, rootPath);

    const settled = await pollJob(base);
    assert.equal(settled.job.status, "failed", "absence of a real provider must fail truthfully instead of manufacturing success");
    assert.match(settled.job.error, /NO_ROUTABLE_MODEL|routing failed/i);

    const mission = await fetch(`${base}/api/missions/${encodeURIComponent(missionId)}`, { cache: "no-store" });
    const missionBody = await mission.json();
    assert.equal(missionBody.mission.status, "failed", "provider routing failure must persist into mission state");
    assert.equal(missionBody.execution.failedTaskIds.length, 1);
    assert.equal(missionBody.results.length, 1, "failed provider attempt must preserve an attributable workforce result");
    assert.ok(
      missionBody.results[0].verificationReferences.some((reference) => reference.startsWith("router-request:")),
      "failed result must preserve router request evidence",
    );

    const retryWithoutConfirmation = await fetch(`${base}/api/missions/${encodeURIComponent(missionId)}/retry`, {
      method: "POST",
    });
    assert.equal(retryWithoutConfirmation.status, 400, "mission retry must require a distinct explicit confirmation");

    console.log("OWNER-CONSOLE mission execution confirmation + truthful provider failure: SUCCESS");
  } finally {
    await stop(run.child);
    await rm(state.base, { recursive: true, force: true });
  }
}

async function remoteExecutionAuthentication() {
  const port = await freePort();
  const state = statePaths();
  const token = "kings-owner-execution-token-0123456789abcdef";
  const run = startOwner({ port, bind: "0.0.0.0", token, state });
  try {
    await waitForHealth(port, run);
    const base = `http://127.0.0.1:${port}`;
    const anonymousExecutionState = await fetch(`${base}/api/mission-execution`, { cache: "no-store" });
    assert.equal(anonymousExecutionState.status, 401, "remote execution/provider state must not be public");
    const anonymousExecute = await fetch(`${base}/api/missions/not-a-real-mission/execute`, {
      method: "POST",
      headers: { "x-kings-owner-action": "execute-mission" },
    });
    assert.equal(anonymousExecute.status, 401, "anonymous remote caller must never start mission execution");

    const authenticatedState = await fetch(`${base}/api/mission-execution`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(authenticatedState.status, 200, "owner bearer authentication must authorize execution-state inspection");

    console.log("OWNER-CONSOLE remote mission execution authentication: SUCCESS");
  } finally {
    await stop(run.child);
    await rm(state.base, { recursive: true, force: true });
  }
}

await loopbackExecutionBoundary();
await remoteExecutionAuthentication();
console.log("K.I.N.G.S. OWNER CONSOLE GOVERNED MISSION EXECUTION: SUCCESS");
