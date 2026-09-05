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

function temporaryOwnerState() {
  const stateRoot = join(
    tmpdir(),
    `kings-owner-console-${process.pid}-${randomUUID()}`,
  );
  return {
    stateRoot,
    missionStore: join(stateRoot, "owner-missions.json"),
    contextStore: join(stateRoot, "owner-context.json"),
  };
}

function startOwner({ port, bind, token, state = temporaryOwnerState() }) {
  const env = {
    ...process.env,
    KINGS_CODING_MACHINE_PORT: String(port),
    KINGS_CODING_MACHINE_BIND: bind,
    KINGS_CONNECTOR_HEALTH_TIMEOUT_MS: "40",
    KINGS_CODING_MACHINE_WORKSPACE: rootPath,
    KINGS_OWNER_MISSION_STORE: state.missionStore,
    KINGS_OWNER_CONTEXT_STORE: state.contextStore,
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
  return { child, state, output: () => output };
}

async function waitForHealth(port, child, output) {
  const deadline = Date.now() + 10_000;
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

async function cleanupOwnerState(state) {
  await rm(state.stateRoot, { recursive: true, force: true });
}

async function assertRemoteStartupRequiresToken() {
  const port = await freePort();
  const run = startOwner({ port, bind: "0.0.0.0", token: undefined });
  try {
    const [code] = await once(run.child, "exit");
    assert.notEqual(code, 0, "non-loopback owner console must fail closed without an owner token");
    assert.match(run.output(), /refuses non-loopback binding without KINGS_CODING_MACHINE_TOKEN/);
  } finally {
    await cleanupOwnerState(run.state);
  }
}

async function assertLoopbackRemainsLocalAndUsable() {
  const port = await freePort();
  const state = temporaryOwnerState();
  const run = startOwner({
    port,
    bind: "127.0.0.1",
    token: undefined,
    state,
  });
  let missionId;
  let contextId;
  let contextSha;
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

    const initialContext = await fetch(`${base}/api/context`, { cache: "no-store" });
    assert.equal(initialContext.status, 200, "loopback owner must be able to inspect staged project context");
    const initialContextBody = await initialContext.json();
    assert.deepEqual(initialContextBody.documents, [], "fresh owner context store must start empty");

    const unconfirmedPdf = await fetch(`${base}/api/context/pdf`, {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "x-kings-file-name": encodeURIComponent("Requirements.pdf"),
      },
      body: createTextPdf("KINGS OWNER PDF API TEST"),
    });
    assert.equal(unconfirmedPdf.status, 400, "PDF import must require an explicit fixed owner action");
    const unconfirmedPdfBody = await unconfirmedPdf.json();
    assert.equal(unconfirmedPdfBody.error, "pdf_import_confirmation_required");

    const importedPdf = await fetch(`${base}/api/context/pdf`, {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "x-kings-owner-action": "import-pdf",
        "x-kings-file-name": encodeURIComponent("Requirements.pdf"),
      },
      body: createTextPdf("KINGS OWNER PDF API TEST"),
    });
    assert.equal(importedPdf.status, 201, "confirmed PDF bytes must be extracted and persisted by K.I.N.G.S.");
    const importedPdfBody = await importedPdf.json();
    assert.equal(importedPdfBody.ok, true);
    assert.equal(importedPdfBody.document.pageCount, 1);
    assert.equal(importedPdfBody.document.sourcePreserved, true, "original PDF source bytes must be preserved server-side");
    assert.match(importedPdfBody.document.sha256, /^[a-f0-9]{64}$/u);
    contextId = importedPdfBody.document.id;
    contextSha = importedPdfBody.document.sha256;

    const listedContext = await fetch(`${base}/api/context`, { cache: "no-store" });
    const listedContextBody = await listedContext.json();
    assert.equal(listedContextBody.documents.length, 1, "imported PDF must be visible as staged context metadata");
    assert.equal(listedContextBody.documents[0].id, contextId);
    assert.equal("text" in listedContextBody.documents[0], false, "browser context listing must not expose editable extracted text");

    const browserInjectedContext = await fetch(`${base}/api/missions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kings-owner-action": "create-mission",
      },
      body: JSON.stringify({
        ownerVision: "Build a mission from real server context.",
        contextDocuments: [
          {
            id: contextId,
            name: "fake.pdf",
            mediaType: "application/pdf",
            sha256: "0".repeat(64),
            text: "browser-injected fake context",
          },
        ],
      }),
    });
    assert.equal(browserInjectedContext.status, 400, "browser must not be able to inject or replace extracted context text");

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
        contextDocumentIds: [contextId],
      }),
    });
    assert.equal(created.status, 201, "confirmed owner vision plus server context id must create a persistent mission");
    const createdBody = await created.json();
    assert.equal(createdBody.ok, true);
    assert.equal(createdBody.mission.name, "Collector Workbench");
    assert.equal(createdBody.plan.approvedByHuman, true, "Build From This Vision must record explicit human approval");
    assert.equal(createdBody.plan.locked, true, "approved owner plan must be locked before task assembly");
    assert.ok(createdBody.tasks.length >= 8, "owner vision must create the real multi-stage product build task graph");
    assert.ok(createdBody.execution.runnableTaskIds.length >= 1, "created mission must expose runnable dependency state");
    assert.equal(createdBody.contextDocuments.length, 1, "mission must retain the selected server-side PDF context");
    assert.equal(createdBody.contextDocuments[0].id, contextId);
    assert.equal(createdBody.contextDocuments[0].sha256, contextSha);
    assert.ok(
      createdBody.tasks.every((task) =>
        task.inputReferences.includes(`owner-context:${contextId}:${contextSha}`),
      ),
      "every generated task must retain the authoritative PDF context provenance reference",
    );
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
    state,
  });
  try {
    await waitForHealth(restartPort, restarted.child, restarted.output);
    const base = `http://127.0.0.1:${restartPort}`;
    const restoredContext = await fetch(`${base}/api/context`, { cache: "no-store" });
    const restoredContextBody = await restoredContext.json();
    assert.equal(restoredContextBody.documents.length, 1, "staged PDF context must survive a full console process restart");
    assert.equal(restoredContextBody.documents[0].id, contextId);
    assert.equal(restoredContextBody.documents[0].sha256, contextSha);

    const restored = await fetch(`${base}/api/missions`, { cache: "no-store" });
    assert.equal(restored.status, 200);
    const restoredBody = await restored.json();
    assert.equal(restoredBody.missions.length, 1, "owner mission must survive a full console process restart");
    assert.equal(restoredBody.missions[0].mission.id, missionId, "restart must preserve mission identity");
    assert.equal(restoredBody.missions[0].plan.locked, true, "restart must preserve locked approval state");
    assert.ok(restoredBody.missions[0].tasks.length >= 8, "restart must restore executable task graph");
    assert.equal(restoredBody.missions[0].contextDocuments[0].id, contextId, "restart must preserve mission-to-PDF context attachment");
  } finally {
    await stop(restarted.child);
    await cleanupOwnerState(state);
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

    const anonymousContext = await fetch(`${base}/api/context`, { cache: "no-store" });
    assert.equal(anonymousContext.status, 401, "remote project context metadata must be private to the authenticated owner");

    const anonymousPdf = await fetch(`${base}/api/context/pdf`, {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "x-kings-owner-action": "import-pdf",
        "x-kings-file-name": encodeURIComponent("anonymous.pdf"),
      },
      body: createTextPdf("ANONYMOUS PDF"),
    });
    assert.equal(anonymousPdf.status, 401, "anonymous callers must never stage PDF project context");

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

    const wrongPdfConfirmation = await fetch(`${base}/api/context/pdf`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/pdf",
        "x-kings-owner-action": "create-mission",
        "x-kings-file-name": encodeURIComponent("wrong-confirmation.pdf"),
      },
      body: createTextPdf("WRONG PDF CONFIRMATION"),
    });
    assert.equal(wrongPdfConfirmation.status, 400, "mission confirmation must not authorize PDF import");

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
    await cleanupOwnerState(run.state);
  }
}

function createTextPdf(text) {
  const safeText = String(text).replace(/([\\()])/gu, "\\$1");
  const stream = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    `(${safeText}) Tj`,
    "ET",
    "",
  ].join("\n");
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let index = 0; index < bodies.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${bodies[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${bodies.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += [
    "trailer",
    `<< /Size ${bodies.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  return Buffer.from(pdf, "ascii");
}

await assertRemoteStartupRequiresToken();
await assertLoopbackRemainsLocalAndUsable();
await assertRemoteAuthenticationLifecycle();
console.log("K.I.N.G.S. owner-console auth + voice mission + governed PDF context boundary: SUCCESS");
