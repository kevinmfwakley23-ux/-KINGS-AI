import http from "node:http";
import os from "node:os";
import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { OwnerMissionRuntime } = require("../../build/core/workforce/owner-mission-runtime.js");
const { OwnerPdfContextRuntime } = require("../../build/core/workforce/owner-pdf-context-runtime.js");
const { createOwnerMissionExecutionService } = require("../../build/core/workforce/owner-mission-execution-service.js");

const port = Number(process.env.KINGS_CODING_MACHINE_PORT ?? 8787);
const host = String(process.env.KINGS_CODING_MACHINE_BIND ?? "127.0.0.1").trim();
const timeoutMs = Number(process.env.KINGS_CONNECTOR_HEALTH_TIMEOUT_MS ?? 1500);
const ownerToken = String(process.env.KINGS_CODING_MACHINE_TOKEN ?? "").trim();
const ownerCookieName = "__Host-kings_owner_access";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const remoteMode = !loopbackHosts.has(host);
const ownerSessionToken = ownerToken
  ? createHash("sha256").update(`kings-owner-session:${ownerToken}`).digest("hex")
  : "";
const engineeringWorkspace = resolve(
  String(process.env.KINGS_CODING_MACHINE_WORKSPACE ?? process.cwd()).trim() || process.cwd(),
);
const engineeringControlPath = resolve(
  process.cwd(),
  "build/core/workforce/owner-engineering-control.js",
);
const ownerMissionStorePath = resolve(
  String(
    process.env.KINGS_OWNER_MISSION_STORE ??
      resolve(process.cwd(), ".kings", "owner-missions.json"),
  ).trim() || resolve(process.cwd(), ".kings", "owner-missions.json"),
);
const ownerContextStorePath = resolve(
  String(
    process.env.KINGS_OWNER_CONTEXT_STORE ??
      resolve(process.cwd(), ".kings", "owner-context.json"),
  ).trim() || resolve(process.cwd(), ".kings", "owner-context.json"),
);
const ownerPdfExtractorPath = resolve(
  process.cwd(),
  "runtimes/knowledge-ingestion/extract_owner_pdf.py",
);
const engineeringOutputLimit = 1024 * 1024;
const ownerJsonBodyLimit = 1024 * 1024;
const ownerPdfBodyLimit = 20 * 1024 * 1024;
let engineeringJob = null;
let engineeringChild = null;
let engineeringSequence = 0;
let missionExecutionJob = null;
let missionExecutionSequence = 0;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("KINGS_CODING_MACHINE_PORT must be a valid TCP port");
}
if (!host) throw new Error("KINGS_CODING_MACHINE_BIND must not be empty");
if (remoteMode && ownerToken.length < 24) {
  throw new Error(
    "K.I.N.G.S. Owner Console refuses non-loopback binding without KINGS_CODING_MACHINE_TOKEN of at least 24 characters",
  );
}

const ownerMissionRuntime = new OwnerMissionRuntime(ownerMissionStorePath);
await ownerMissionRuntime.initialize();
const ownerPdfContextRuntime = new OwnerPdfContextRuntime({
  storePath: ownerContextStorePath,
  extractorPath: ownerPdfExtractorPath,
  ...(process.env.KINGS_PYTHON_EXECUTABLE
    ? { pythonExecutable: process.env.KINGS_PYTHON_EXECUTABLE }
    : {}),
});
await ownerPdfContextRuntime.initialize();
const ownerMissionExecutionService = createOwnerMissionExecutionService(
  ownerMissionRuntime,
  {
    workspaceRoot: engineeringWorkspace,
    env: process.env,
  },
);

const ollamaConfigured = Boolean(
  process.env.KINGS_OLLAMA_BASE_URL &&
  (process.env.KINGS_OLLAMA_MODELS || process.env.KINGS_OLLAMA_MODEL),
);
const connectors = [
  {
    id: "omniroute",
    label: "OmniRoute",
    url: process.env.KINGS_OMNIROUTE_BASE_URL ?? "http://127.0.0.1:20128/v1",
    healthPath: "/models",
    configured: Boolean(
      process.env.KINGS_OMNIROUTE_BASE_URL ||
      process.env.KINGS_OMNIROUTE_HOSTPORT ||
      process.env.KINGS_OMNIROUTE_MODELS
    ),
    apiKey: process.env.KINGS_OMNIROUTE_API_KEY,
  },
  {
    id: "9router",
    label: "9Router",
    url: process.env.KINGS_9ROUTER_BASE_URL ?? "http://127.0.0.1:20128/v1",
    healthPath: "/models",
    configured: Boolean(
      process.env.KINGS_9ROUTER_BASE_URL ||
      process.env.KINGS_9ROUTER_HOSTPORT ||
      process.env.KINGS_9ROUTER_MODELS
    ),
    apiKey: process.env.KINGS_9ROUTER_API_KEY,
  },
  {
    id: "ollama-internal",
    label: "Ollama fallback",
    url: process.env.KINGS_OLLAMA_BASE_URL ??
      process.env.KINGS_CODING_MACHINE_OLLAMA_URL ??
      "http://127.0.0.1:11434",
    healthPath: "/api/tags",
    configured: ollamaConfigured,
  },
];

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function tokenMatches(actual, expected) {
  const left = Buffer.from(String(actual ?? ""));
  const right = Buffer.from(String(expected ?? ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function parseCookies(value) {
  const cookies = Object.create(null);
  for (const part of String(value ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    if (!name) continue;
    try { cookies[name] = decodeURIComponent(raw); }
    catch { cookies[name] = raw; }
  }
  return cookies;
}

function authorizeOwnerRequest(req, url) {
  if (!remoteMode) return { allowed: true, bootstrap: false };
  if (url.searchParams.has("access")) {
    const supplied = url.searchParams.get("access") ?? "";
    const bootstrap = req.method === "GET" && url.pathname === "/" && tokenMatches(supplied, ownerToken);
    return { allowed: bootstrap, bootstrap };
  }
  const authorization = String(req.headers.authorization ?? "");
  if (authorization.startsWith("Bearer ") && tokenMatches(authorization.slice(7).trim(), ownerToken)) {
    return { allowed: true, bootstrap: false };
  }
  const cookies = parseCookies(req.headers.cookie);
  if (tokenMatches(cookies[ownerCookieName], ownerSessionToken)) {
    return { allowed: true, bootstrap: false };
  }
  return { allowed: false, bootstrap: false };
}

async function probe(connector) {
  if (!connector.configured) {
    return { id: connector.id, label: connector.label, configured: false, reachable: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = connector.apiKey ? { authorization: `Bearer ${connector.apiKey}` } : {};
    const response = await fetch(joinUrl(connector.url, connector.healthPath), {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    return {
      id: connector.id,
      label: connector.label,
      configured: true,
      reachable: response.ok,
      status: response.status,
    };
  } catch {
    return { id: connector.id, label: connector.label, configured: true, reachable: false };
  } finally {
    clearTimeout(timer);
  }
}

function boundedAppend(current, chunk) {
  const next = current + String(chunk ?? "");
  return next.length <= engineeringOutputLimit
    ? next
    : next.slice(next.length - engineeringOutputLimit);
}

function parseEngineeringResult(stdout) {
  const lines = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (value && typeof value === "object") return value;
    } catch {}
  }
  return undefined;
}

function publicEngineeringJob() {
  return engineeringJob ? JSON.parse(JSON.stringify(engineeringJob)) : null;
}

function startEngineeringJob(action) {
  if (action !== "readiness" && action !== "verify") {
    throw new Error("Unsupported owner engineering action.");
  }
  if (engineeringJob?.status === "running") return null;
  if (!existsSync(engineeringControlPath)) {
    throw new Error(
      "Compiled owner engineering control is missing. Build K.I.N.G.S. before starting engineering jobs.",
    );
  }

  engineeringSequence += 1;
  const id = `owner-engineering-job-${engineeringSequence}`;
  engineeringJob = {
    id,
    action,
    status: "running",
    workspace: engineeringWorkspace,
    startedAt: new Date().toISOString(),
    completedAt: null,
    exitCode: null,
    signal: null,
    result: null,
    error: null,
  };

  const child = spawn(process.execPath, [engineeringControlPath, action], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      KINGS_CODING_MACHINE_WORKSPACE: engineeringWorkspace,
    },
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  engineeringChild = child;
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout = boundedAppend(stdout, chunk); });
  child.stderr.on("data", (chunk) => { stderr = boundedAppend(stderr, chunk); });
  child.once("error", (error) => {
    if (!engineeringJob || engineeringJob.id !== id) return;
    engineeringJob.status = "failed";
    engineeringJob.completedAt = new Date().toISOString();
    engineeringJob.error = error.message;
    engineeringChild = null;
  });
  child.once("close", (code, signal) => {
    if (!engineeringJob || engineeringJob.id !== id) return;
    const result = parseEngineeringResult(stdout);
    engineeringJob.exitCode = code;
    engineeringJob.signal = signal ? String(signal) : null;
    engineeringJob.completedAt = new Date().toISOString();
    engineeringJob.result = result ?? null;
    if (!result) {
      engineeringJob.status = "failed";
      engineeringJob.error = stderr.trim() || "Owner engineering worker returned no parseable result.";
    } else if (result.ok === true && code === 0) {
      engineeringJob.status = "completed";
      engineeringJob.error = null;
    } else {
      engineeringJob.status = "failed";
      engineeringJob.error = result.message || result.verify?.failureReason || stderr.trim() || `Engineering job exited with code ${code}.`;
    }
    engineeringChild = null;
  });
  return publicEngineeringJob();
}

function publicMissionExecutionJob() {
  return missionExecutionJob ? JSON.parse(JSON.stringify(missionExecutionJob)) : null;
}

function startMissionExecutionJob(missionId) {
  if (missionExecutionJob?.status === "running") return null;
  const snapshot = ownerMissionRuntime.snapshot(missionId);
  if (snapshot.mission.status === "completed") {
    throw Object.assign(new Error("Mission is already completed."), { statusCode: 409 });
  }
  if (snapshot.mission.status === "failed") {
    throw Object.assign(
      new Error("Mission has a failed task. Retry the mission before executing it again."),
      { statusCode: 409 },
    );
  }

  missionExecutionSequence += 1;
  const id = `owner-mission-execution-${missionExecutionSequence}`;
  missionExecutionJob = {
    id,
    missionId,
    status: "running",
    workspace: engineeringWorkspace,
    providerOrder: [...ownerMissionExecutionService.providerOrder],
    availableProviders: [...ownerMissionExecutionService.providerIds],
    startedAt: new Date().toISOString(),
    completedAt: null,
    stoppedBecause: null,
    completedTaskCount: 0,
    failedTaskId: null,
    error: null,
  };

  void Promise.resolve()
    .then(() => ownerMissionExecutionService.executor.run(missionId, 16))
    .then((result) => {
      if (!missionExecutionJob || missionExecutionJob.id !== id) return;
      missionExecutionJob.completedAt = new Date().toISOString();
      missionExecutionJob.stoppedBecause = result.stoppedBecause;
      missionExecutionJob.completedTaskCount = result.snapshot.execution.completedTaskIds.length;
      missionExecutionJob.failedTaskId = result.snapshot.execution.failedTaskIds[0] ?? null;
      missionExecutionJob.status = result.stoppedBecause === "completed" ? "completed" : "failed";
      if (result.stoppedBecause !== "completed") {
        missionExecutionJob.error = result.snapshot.results.at(-1)?.summary ||
          `Mission execution stopped because: ${result.stoppedBecause}.`;
      }
    })
    .catch((error) => {
      if (!missionExecutionJob || missionExecutionJob.id !== id) return;
      missionExecutionJob.status = "failed";
      missionExecutionJob.completedAt = new Date().toISOString();
      missionExecutionJob.error = error instanceof Error ? error.message : String(error);
    });

  return publicMissionExecutionJob();
}

function actionHeaderMatches(req, action) {
  return String(req.headers["x-kings-owner-action"] ?? "").trim() === action;
}

async function readJsonBody(req) {
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw Object.assign(new Error("Content-Type must be application/json."), { statusCode: 415 });
  }
  const raw = await readRawBody(req, ownerJsonBodyLimit);
  try {
    const parsed = JSON.parse(raw.toString("utf8") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Owner request body must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    if (error?.statusCode) throw error;
    throw Object.assign(
      new Error(error instanceof SyntaxError ? "Owner request body must contain valid JSON." : error.message),
      { statusCode: 400 },
    );
  }
}

async function readRawBody(req, maximumBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maximumBytes) {
      throw Object.assign(
        new Error(`Owner request exceeds the ${maximumBytes}-byte body limit.`),
        { statusCode: 413 },
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function ownerPdfName(req) {
  const header = req.headers["x-kings-file-name"];
  if (typeof header !== "string" || !header.trim()) {
    throw Object.assign(new Error("X-KINGS-File-Name is required for PDF context import."), { statusCode: 400 });
  }
  let decoded;
  try { decoded = decodeURIComponent(header); }
  catch {
    throw Object.assign(new Error("X-KINGS-File-Name must be URI encoded text."), { statusCode: 400 });
  }
  const name = decoded.trim();
  if (!name || name.length > 512) {
    throw Object.assign(new Error("PDF file name must contain 1 to 512 characters."), { statusCode: 400 });
  }
  return name;
}

function assertOnlyKeys(value, allowed) {
  const allow = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allow.has(key));
  if (unexpected.length) {
    throw Object.assign(
      new Error(`Owner request contains unsupported field(s): ${unexpected.join(", ")}.`),
      { statusCode: 400 },
    );
  }
}

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...extraHeaders,
  });
  res.end(payload);
}

function html(res, body) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    "referrer-policy": "no-referrer",
  });
  res.end(body);
}

function establishOwnerSession(res) {
  res.writeHead(303, {
    location: "/",
    "set-cookie": `${ownerCookieName}=${encodeURIComponent(ownerSessionToken)}; Path=/; HttpOnly; Secure; SameSite=Strict`,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  res.end();
}

function unauthorized(res) {
  return json(
    res,
    401,
    {
      ok: false,
      error: "owner_authentication_required",
      message: "Authenticate through the secure owner bootstrap URL or a Bearer token.",
    },
    { "www-authenticate": 'Bearer realm="K.I.N.G.S. Owner Console"' },
  );
}

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>K.I.N.G.S. AI Owner Console</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:light;--ink:#151515;--muted:#686159;--gold:#9b7121;--gold2:#d8be78;--edge:#d8d0c3;--paper:rgba(255,255,255,.92);--ok:#26763b;--bad:#a52c25;--shadow:0 18px 50px rgba(18,18,18,.1)}*{box-sizing:border-box}body{margin:0;min-height:100vh;color:var(--ink);background:#f7f5ef;background-image:linear-gradient(120deg,transparent 0 27%,rgba(20,20,20,.045) 27.2%,transparent 27.5% 65%,rgba(168,124,38,.11) 65.2%,transparent 65.5%)}.wrap{max-width:1080px;margin:auto;padding:22px 14px 50px}header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.eyebrow{font-size:.72rem;font-weight:850;letter-spacing:.13em;text-transform:uppercase;color:var(--gold)}h1,h2,h3{font-family:Georgia,serif}h1{font-size:clamp(2rem,7vw,3.45rem);margin:.12rem 0}.muted{color:var(--muted)}.card{margin-top:15px;padding:18px;background:var(--paper);border:1px solid var(--edge);border-top:2px solid var(--gold2);border-radius:14px;box-shadow:var(--shadow)}textarea,input{width:100%;font:inherit;border:1px solid #c8c0b4;border-radius:9px;padding:11px;background:#fff}textarea{min-height:150px;resize:vertical;line-height:1.5}label{display:block;font-weight:800;font-size:.82rem;margin:10px 0 5px}button{font:inherit;font-weight:800;border-radius:9px;padding:10px 13px;border:1px solid #181818;background:#181818;color:white;cursor:pointer}button.secondary{background:white;color:#181818;border-color:#bcb2a4}button.gold{background:linear-gradient(#b58a32,#8e651b);border-color:#8e651b}button:disabled{opacity:.48;cursor:not-allowed}.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.grow{flex:1 1 260px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.status{border:1px solid var(--edge);border-radius:10px;padding:11px;background:#fff}.mission{border:1px solid var(--edge);border-left:3px solid var(--gold);border-radius:10px;padding:12px;background:#fff;margin-top:9px}.pill{display:inline-block;border:1px solid #d0c5b4;border-radius:999px;padding:3px 7px;font-size:.72rem;font-weight:800;margin:4px 4px 0 0}.success{color:var(--ok)}.error{color:var(--bad)}.dropzone{border:1.5px dashed #aa9470;border-radius:11px;padding:16px;text-align:center;background:#fff;margin-top:13px}.dropzone.drag{background:#fbf4df;border-color:var(--gold)}.context-item{display:flex;gap:8px;border:1px solid var(--edge);border-radius:8px;padding:9px;margin-top:7px;background:#fff}.context-item input{width:auto}.context-meta{font-size:.76rem;color:var(--muted);word-break:break-all}pre{white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto;background:#f0ede6;border-radius:8px;padding:10px}code{background:#f0ede6;padding:2px 4px;border-radius:4px}@media(max-width:600px){.wrap{padding:12px 9px 35px}.card{padding:14px}.row button{flex:1 1 145px}}
</style></head><body><main class="wrap">
<header><div><div class="eyebrow">KNOWLEDGE • INVESTIGATION • NARRATIVE • GENERATION • SYSTEM</div><h1>K.I.N.G.S. AI</h1><div class="muted">Owner command console · governed autonomous engineering</div></div><button class="secondary" onclick="refreshAll()">Refresh</button></header>
<section class="card"><div class="eyebrow">Owner Vision</div><h2>Talk to K.I.N.G.S.</h2><p class="muted">Describe what to build or repair. <strong>Build From This Vision</strong> creates an approved locked mission and starts the real governed execution loop against the server-configured repository.</p><label for="vision">What should K.I.N.G.S. build?</label><textarea id="vision" placeholder="Describe the feature, repair, application, or system…"></textarea><div id="voice-state" class="muted">Voice dictation depends on browser support. Text always works.</div><label for="product-name">Mission / product name (optional)</label><input id="product-name" maxlength="160"><div id="context-drop" class="dropzone"><strong>Project context PDFs</strong><div class="muted">Drop PDFs here or choose files. Extraction and source preservation happen in K.I.N.G.S., not the browser.</div><input id="pdf-input" type="file" accept="application/pdf,.pdf" multiple hidden><button type="button" class="secondary" onclick="document.getElementById('pdf-input').click()">Choose PDFs</button><div id="context-upload-status" class="muted"></div></div><div id="context-list" class="muted">Loading context…</div><div class="row" style="margin-top:12px"><button id="voice-button" class="secondary" onclick="toggleVoice()">🎙 Talk</button><button id="build-button" class="gold" onclick="buildVision()">Build From This Vision</button></div><div id="mission-create-status" class="muted" style="margin-top:10px"></div></section>
<section class="card"><div class="row"><div class="grow"><h2 style="margin:.1rem 0">Mission Control</h2><div class="muted">Task transitions, model attribution, governed writes and verification results persist on disk.</div></div><button class="secondary" onclick="refreshMissions()">Refresh Missions</button></div><div id="mission-job" class="muted" style="margin-top:8px"></div><div id="missions" class="muted">Loading…</div></section>
<section class="card"><h2>AI Routing</h2><p class="muted">Server policy controls model routing. OmniRoute and 9Router are first-class routes; local Ollama appears only when explicitly configured as fallback.</p><div id="routing" class="muted"></div><div id="connectors" class="grid" style="margin-top:10px"></div></section>
<section class="card"><h2>Governed Engineering</h2><p class="muted">Browser requests cannot supply a shell command, executable, arguments, provider secret, or alternate workspace.</p><p><strong>Workspace:</strong> <code id="engineering-workspace">Loading…</code></p><div class="row"><button class="secondary" onclick="startEngineering('readiness')">Inspect Readiness</button><button onclick="startEngineering('verify')">Run Governed Verify</button></div><div id="engineering-status" class="muted" style="margin-top:9px"></div><pre id="engineering-evidence" hidden></pre></section>
<section class="card"><h2>Runtime</h2><div id="runtime" class="muted">Loading…</div></section>
</main><script>
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let recognition=null,listening=false,speechPrefix='',contextUploadBusy=false;const selectedContextIds=new Set();
async function requestJson(path,options={}){const r=await fetch(path,{cache:'no-store',...options});let b={};try{b=await r.json()}catch{}if(!r.ok)throw new Error(b.message||('HTTP '+r.status));return b}
function toggleVoice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){document.getElementById('voice-state').textContent='Browser speech recognition is unavailable; use keyboard voice dictation or type.';return}if(recognition&&listening){recognition.stop();return}const area=document.getElementById('vision');speechPrefix=area.value.trim();recognition=new SR();recognition.continuous=true;recognition.interimResults=true;recognition.lang=navigator.language||'en-US';recognition.onstart=()=>{listening=true;document.getElementById('voice-button').textContent='Stop';document.getElementById('voice-state').textContent='Listening…'};recognition.onresult=e=>{let final='',interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)final+=t;else interim+=t}if(final)speechPrefix=(speechPrefix+' '+final).trim();area.value=(speechPrefix+' '+interim).trim()};recognition.onend=()=>{listening=false;document.getElementById('voice-button').textContent='🎙 Talk';document.getElementById('voice-state').textContent='Voice stopped. Transcript remains editable.'};recognition.start()}
async function uploadPdf(file){if(!file||!String(file.name).toLowerCase().endsWith('.pdf'))throw new Error('Only PDF context files are accepted.');const status=document.getElementById('context-upload-status');status.textContent='Importing '+file.name+'…';const r=await fetch('/api/context/pdf',{method:'POST',headers:{'content-type':'application/pdf','x-kings-owner-action':'import-pdf','x-kings-file-name':encodeURIComponent(file.name)},body:file});const b=await r.json();if(!r.ok)throw new Error(b.message||('PDF import failed: HTTP '+r.status));selectedContextIds.add(b.document.id);status.textContent='Imported '+file.name+'.';await refreshContext()}
async function uploadFiles(files){if(contextUploadBusy)return;contextUploadBusy=true;try{for(const f of files)await uploadPdf(f)}catch(e){document.getElementById('context-upload-status').textContent=e.message}finally{contextUploadBusy=false}}
function renderContext(d){const el=document.getElementById('context-list');if(!d.documents.length){el.innerHTML='<span class="muted">No PDFs staged.</span>';return}el.innerHTML=d.documents.map(x=>'<label class="context-item"><input type="checkbox" '+(selectedContextIds.has(x.id)?'checked':'')+' onchange="selectContext(\''+esc(x.id)+'\',this.checked)"><span><strong>'+esc(x.name)+'</strong><div class="context-meta">'+x.pageCount+' page(s) · '+x.characterCount+' chars · '+esc(x.sha256.slice(0,12))+'… · source preserved</div></span></label>').join('')}
function selectContext(id,checked){if(checked)selectedContextIds.add(id);else selectedContextIds.delete(id)}
async function refreshContext(){try{renderContext(await requestJson('/api/context'))}catch(e){document.getElementById('context-list').textContent=e.message}}
async function buildVision(){const status=document.getElementById('mission-create-status');const vision=document.getElementById('vision').value.trim();if(!vision){status.className='error';status.textContent='Describe what K.I.N.G.S. should build first.';return}const btn=document.getElementById('build-button');btn.disabled=true;status.className='muted';status.textContent='Creating approved mission…';try{const b=await requestJson('/api/missions',{method:'POST',headers:{'content-type':'application/json','x-kings-owner-action':'create-mission'},body:JSON.stringify({ownerVision:vision,productName:document.getElementById('product-name').value.trim()||undefined,contextDocumentIds:[...selectedContextIds]})});status.className='success';status.textContent='Mission locked. Starting governed execution…';await executeMission(b.mission.id);await refreshMissions()}catch(e){status.className='error';status.textContent=e.message}finally{btn.disabled=false}}
async function executeMission(id){const b=await requestJson('/api/missions/'+encodeURIComponent(id)+'/execute',{method:'POST',headers:{'x-kings-owner-action':'execute-mission'}});document.getElementById('mission-job').textContent='Execution started for '+b.job.missionId+'.';scheduleRefresh()}
async function retryMission(id){try{await requestJson('/api/missions/'+encodeURIComponent(id)+'/retry',{method:'POST',headers:{'x-kings-owner-action':'retry-mission'}});await executeMission(id);await refreshMissions()}catch(e){document.getElementById('mission-job').textContent=e.message}}
function missionCard(x){const e=x.execution;const total=x.tasks.length;const running=e.runningTaskIds.length;const completed=e.completedTaskIds.length;const failed=e.failedTaskIds.length;const action=x.mission.status==='failed'?'<button class="secondary" onclick="retryMission(\''+esc(x.mission.id)+'\')">Retry Mission</button>':x.mission.status==='completed'?'':'<button onclick="executeMission(\''+esc(x.mission.id)+'\')">Execute Mission</button>';const last=x.results?.at(-1);return '<div class="mission"><div class="row"><div class="grow"><strong>'+esc(x.mission.name)+'</strong><div class="muted">'+esc(x.mission.status)+' · '+completed+'/'+total+' completed · '+running+' running · '+failed+' failed</div><span class="pill">approved + locked</span><span class="pill">'+x.contextDocuments.length+' context docs</span><span class="pill">'+(x.results?.length||0)+' results</span></div>'+action+'</div>'+(last?'<details><summary>Latest evidence</summary><div>'+esc(last.summary)+'</div><div class="context-meta">'+last.verificationReferences.map(esc).join(' · ')+'</div></details>':'')+'</div>'}
async function refreshMissions(){try{const b=await requestJson('/api/missions');document.getElementById('missions').innerHTML=b.missions.length?b.missions.map(missionCard).join(''):'No owner missions yet.'}catch(e){document.getElementById('missions').textContent=e.message}}
async function refreshExecution(){try{const b=await requestJson('/api/mission-execution');const j=b.job;document.getElementById('routing').textContent='Order: '+b.providerOrder.join(' → ')+' | Available now: '+(b.availableProviders.join(', ')||'none configured');document.getElementById('mission-job').textContent=j?(j.status+' · '+j.missionId+(j.error?' · '+j.error:'')):'No mission execution job running.';if(j?.status==='running')scheduleRefresh()}catch(e){document.getElementById('mission-job').textContent=e.message}}
let refreshTimer=null;function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{await refreshMissions();await refreshExecution()},1500)}
async function refreshStatus(){try{const b=await requestJson('/api/status');document.getElementById('runtime').innerHTML='<strong>'+esc(b.platform)+' '+esc(b.arch)+'</strong> · Node '+esc(b.node)+' · '+esc(b.hostname)+'<br><span class="muted">PID '+b.pid+' · uptime '+Math.round(b.uptimeSeconds)+'s</span>'}catch(e){document.getElementById('runtime').textContent=e.message}}
async function refreshConnectors(){try{const b=await requestJson('/api/connectors');document.getElementById('connectors').innerHTML=b.connectors.map(c=>'<div class="status"><strong>'+esc(c.label)+'</strong><div class="'+(c.reachable?'success':'muted')+'">'+(c.configured?(c.reachable?'reachable':'configured / unavailable'):'not configured')+'</div></div>').join('')}catch(e){document.getElementById('connectors').textContent=e.message}}
async function refreshEngineering(){try{const b=await requestJson('/api/engineering');document.getElementById('engineering-workspace').textContent=b.workspace;const el=document.getElementById('engineering-status');const pre=document.getElementById('engineering-evidence');if(!b.job){el.textContent='No governed validation job running.';pre.hidden=true}else{el.textContent=b.job.status+' · '+b.job.action+(b.job.error?' · '+b.job.error:'');if(b.job.result){pre.textContent=JSON.stringify(b.job.result,null,2);pre.hidden=false}else pre.hidden=true;if(b.job.status==='running')setTimeout(refreshEngineering,800)}}catch(e){document.getElementById('engineering-status').textContent=e.message}}
async function startEngineering(action){try{await requestJson('/api/engineering/'+action,{method:'POST',headers:{'x-kings-owner-action':action}});await refreshEngineering()}catch(e){document.getElementById('engineering-status').textContent=e.message}}
async function refreshAll(){await Promise.all([refreshStatus(),refreshConnectors(),refreshContext(),refreshMissions(),refreshExecution(),refreshEngineering()])}
const drop=document.getElementById('context-drop');const input=document.getElementById('pdf-input');input.addEventListener('change',()=>uploadFiles([...input.files]));for(const name of ['dragenter','dragover'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('drag')});for(const name of ['dragleave','drop'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('drag')});drop.addEventListener('drop',e=>uploadFiles([...e.dataTransfer.files]));refreshAll();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "kings-owner-console" });
  }

  const authorization = authorizeOwnerRequest(req, url);
  if (!authorization.allowed) return unauthorized(res);
  if (authorization.bootstrap) return establishOwnerSession(res);

  if (req.method === "GET" && url.pathname === "/api/status") {
    return json(res, 200, {
      ok: true,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      hostname: os.hostname(),
      pid: process.pid,
      uptimeSeconds: process.uptime(),
      remoteMode,
      workspace: engineeringWorkspace,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/connectors") {
    return json(res, 200, {
      ok: true,
      connectors: await Promise.all(connectors.map(probe)),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/context") {
    return json(res, 200, { ok: true, documents: ownerPdfContextRuntime.list() });
  }

  if (req.method === "POST" && url.pathname === "/api/context/pdf") {
    if (!actionHeaderMatches(req, "import-pdf")) {
      return json(res, 400, {
        ok: false,
        error: "pdf_import_confirmation_required",
        message: "Set X-KINGS-Owner-Action to import-pdf to approve this PDF import.",
      });
    }
    const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
    if (!contentType.startsWith("application/pdf")) {
      return json(res, 415, {
        ok: false,
        error: "pdf_content_type_required",
        message: "Content-Type must be application/pdf.",
      });
    }
    try {
      const document = await ownerPdfContextRuntime.ingest({
        name: ownerPdfName(req),
        bytes: await readRawBody(req, ownerPdfBodyLimit),
      });
      return json(res, 201, { ok: true, document });
    } catch (error) {
      return json(res, Number(error?.statusCode) || 400, {
        ok: false,
        error: "owner_pdf_import_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/missions") {
    return json(res, 200, { ok: true, missions: ownerMissionRuntime.list() });
  }

  if (req.method === "POST" && url.pathname === "/api/missions") {
    if (!actionHeaderMatches(req, "create-mission")) {
      return json(res, 400, {
        ok: false,
        error: "mission_creation_confirmation_required",
        message: "Set X-KINGS-Owner-Action to create-mission to approve and create this mission.",
      });
    }
    try {
      const body = await readJsonBody(req);
      assertOnlyKeys(body, ["ownerVision", "productName", "contextDocumentIds"]);
      const contextDocuments = ownerPdfContextRuntime.resolve(
        body.contextDocumentIds === undefined ? [] : body.contextDocumentIds,
      );
      const snapshot = await ownerMissionRuntime.createMission({
        ownerVision: body.ownerVision,
        ...(body.productName === undefined ? {} : { productName: body.productName }),
        contextDocuments,
      });
      return json(res, 201, { ok: true, ...snapshot });
    } catch (error) {
      return json(res, Number(error?.statusCode) || 400, {
        ok: false,
        error: "owner_mission_creation_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/mission-execution") {
    return json(res, 200, {
      ok: true,
      workspace: engineeringWorkspace,
      providerOrder: [...ownerMissionExecutionService.providerOrder],
      availableProviders: [...ownerMissionExecutionService.providerIds],
      job: publicMissionExecutionJob(),
    });
  }

  const executeMatch = url.pathname.match(/^\/api\/missions\/([^/]+)\/execute$/u);
  if (req.method === "POST" && executeMatch) {
    if (!actionHeaderMatches(req, "execute-mission")) {
      return json(res, 400, {
        ok: false,
        error: "mission_execution_confirmation_required",
        message: "Set X-KINGS-Owner-Action to execute-mission to start the fixed governed mission executor.",
      });
    }
    try {
      const missionId = decodeURIComponent(executeMatch[1]);
      const job = startMissionExecutionJob(missionId);
      if (!job) {
        return json(res, 409, {
          ok: false,
          error: "mission_execution_already_running",
          message: "A governed owner mission is already executing.",
          job: publicMissionExecutionJob(),
        });
      }
      return json(res, 202, { ok: true, job });
    } catch (error) {
      return json(res, Number(error?.statusCode) || 400, {
        ok: false,
        error: "owner_mission_execution_failed_to_start",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const retryMatch = url.pathname.match(/^\/api\/missions\/([^/]+)\/retry$/u);
  if (req.method === "POST" && retryMatch) {
    if (!actionHeaderMatches(req, "retry-mission")) {
      return json(res, 400, {
        ok: false,
        error: "mission_retry_confirmation_required",
        message: "Set X-KINGS-Owner-Action to retry-mission to retry the failed mission task.",
      });
    }
    try {
      const missionId = decodeURIComponent(retryMatch[1]);
      const snapshot = ownerMissionRuntime.snapshot(missionId);
      const failedTaskId = snapshot.execution.failedTaskIds[0];
      if (!failedTaskId) {
        return json(res, 409, {
          ok: false,
          error: "mission_has_no_failed_task",
          message: "Mission has no failed task to retry.",
        });
      }
      await ownerMissionRuntime.retryTask(failedTaskId);
      return json(res, 200, { ok: true, ...ownerMissionRuntime.snapshot(missionId) });
    } catch (error) {
      return json(res, Number(error?.statusCode) || 400, {
        ok: false,
        error: "owner_mission_retry_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const missionMatch = url.pathname.match(/^\/api\/missions\/([^/]+)$/u);
  if (req.method === "GET" && missionMatch) {
    try {
      const missionId = decodeURIComponent(missionMatch[1]);
      return json(res, 200, { ok: true, ...ownerMissionRuntime.snapshot(missionId) });
    } catch (error) {
      return json(res, 404, {
        ok: false,
        error: "owner_mission_not_found",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/engineering") {
    return json(res, 200, {
      ok: true,
      workspace: engineeringWorkspace,
      controlReady: existsSync(engineeringControlPath),
      allowedActions: ["readiness", "verify"],
      job: publicEngineeringJob(),
    });
  }

  const engineeringMatch = url.pathname.match(/^\/api\/engineering\/(readiness|verify)$/u);
  if (req.method === "POST" && engineeringMatch) {
    const action = engineeringMatch[1];
    if (!actionHeaderMatches(req, action)) {
      return json(res, 400, {
        ok: false,
        error: "engineering_action_confirmation_required",
        message: `Set X-KINGS-Owner-Action to ${action} to start this fixed owner operation.`,
      });
    }
    try {
      const job = startEngineeringJob(action);
      if (!job) {
        return json(res, 409, {
          ok: false,
          error: "engineering_job_already_running",
          message: "A governed engineering job is already running.",
          job: publicEngineeringJob(),
        });
      }
      return json(res, 202, { ok: true, job });
    } catch (error) {
      return json(res, 503, {
        ok: false,
        error: "engineering_control_unavailable",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/") return html(res, page);
  return json(res, 404, { ok: false, error: "not_found" });
});

server.requestTimeout = 60_000;
server.headersTimeout = 10_000;
server.listen(port, host, () => {
  if (remoteMode) {
    console.log(`K.I.N.G.S. Owner Console: authenticated remote mode on ${host}:${port}; terminate transport at trusted HTTPS and bootstrap with ?access=<KINGS_CODING_MACHINE_TOKEN>`);
  } else {
    console.log(`K.I.N.G.S. Owner Console: http://${host}:${port}`);
  }
  console.log(`K.I.N.G.S. governed engineering workspace: ${engineeringWorkspace}`);
  console.log(`K.I.N.G.S. owner mission provider order: ${ownerMissionExecutionService.providerOrder.join(" -> ")}`);
  console.log("K.I.N.G.S. persistent owner mission + PDF context + governed execution runtime: ready");
});

function stopEngineeringChild() {
  if (engineeringChild && engineeringChild.exitCode === null) engineeringChild.kill("SIGTERM");
}

function shutdown() {
  stopEngineeringChild();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
