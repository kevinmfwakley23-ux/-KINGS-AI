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

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("KINGS_CODING_MACHINE_PORT must be a valid TCP port");
}
if (!host) {
  throw new Error("KINGS_CODING_MACHINE_BIND must not be empty");
}
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

const connectors = [
  {
    id: "ollama",
    label: "Ollama",
    url: process.env.KINGS_CODING_MACHINE_OLLAMA_URL ?? "http://127.0.0.1:11434",
    healthPath: "/api/tags",
    configured: true,
  },
  {
    id: "omniroute",
    label: "OmniRoute",
    url: process.env.KINGS_OMNIROUTE_BASE_URL ?? "http://127.0.0.1:20128/v1",
    healthPath: "/models",
    configured: Boolean(process.env.KINGS_OMNIROUTE_BASE_URL || process.env.KINGS_OMNIROUTE_MODELS),
    apiKey: process.env.KINGS_OMNIROUTE_API_KEY,
  },
  {
    id: "9router",
    label: "9Router",
    url: process.env.KINGS_9ROUTER_BASE_URL ?? "http://127.0.0.1:20128/v1",
    healthPath: "/models",
    configured: Boolean(process.env.KINGS_9ROUTER_BASE_URL || process.env.KINGS_9ROUTER_MODELS),
    apiKey: process.env.KINGS_9ROUTER_API_KEY,
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
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

function authorizeOwnerRequest(req, url) {
  if (!remoteMode) return { allowed: true, bootstrap: false };

  if (url.searchParams.has("access")) {
    const supplied = url.searchParams.get("access") ?? "";
    return {
      allowed: req.method === "GET" && url.pathname === "/" && tokenMatches(supplied, ownerToken),
      bootstrap: req.method === "GET" && url.pathname === "/" && tokenMatches(supplied, ownerToken),
    };
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
  if (!engineeringJob) return null;
  return JSON.parse(JSON.stringify(engineeringJob));
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

  const child = spawn(
    process.execPath,
    [engineeringControlPath, action],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        KINGS_CODING_MACHINE_WORKSPACE: engineeringWorkspace,
      },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
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

function engineeringActionHeaderMatches(req, action) {
  return String(req.headers["x-kings-owner-action"] ?? "").trim() === action;
}

async function readJsonBody(req) {
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
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
    const wrapped = new Error(
      error instanceof SyntaxError ? "Owner request body must contain valid JSON." : error.message,
    );
    wrapped.statusCode = 400;
    throw wrapped;
  }
}

async function readRawBody(req, maximumBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maximumBytes) {
      const error = new Error(`Owner request exceeds the ${maximumBytes}-byte body limit.`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function ownerPdfName(req) {
  const header = req.headers["x-kings-file-name"];
  if (typeof header !== "string" || !header.trim()) {
    const error = new Error("X-KINGS-File-Name is required for PDF context import.");
    error.statusCode = 400;
    throw error;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(header);
  } catch {
    const error = new Error("X-KINGS-File-Name must be URI encoded text.");
    error.statusCode = 400;
    throw error;
  }
  const name = decoded.trim();
  if (!name || name.length > 512) {
    const error = new Error("PDF file name must contain 1 to 512 characters.");
    error.statusCode = 400;
    throw error;
  }
  return name;
}

function assertOnlyKeys(value, allowed) {
  const allow = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allow.has(key));
  if (unexpected.length) {
    const error = new Error(`Owner request contains unsupported field(s): ${unexpected.join(", ")}.`);
    error.statusCode = 400;
    throw error;
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
<title>K.I.N.G.S. Owner Console</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:light;--ink:#151515;--muted:#666057;--gold:#a77a21;--gold2:#d3b76e;--edge:#d9d3c7;--paper:rgba(255,255,255,.91);--shadow:0 18px 50px rgba(18,18,18,.10)}
*{box-sizing:border-box}body{margin:0;color:var(--ink);min-height:100vh;background:#f7f6f2;background-image:linear-gradient(118deg,transparent 0 23%,rgba(20,20,20,.045) 23.15%,transparent 23.45% 62%,rgba(176,133,44,.09) 62.15%,transparent 62.45%),linear-gradient(24deg,transparent 0 48%,rgba(24,24,24,.035) 48.15%,transparent 48.45%);background-attachment:fixed}.wrap{max-width:1040px;margin:auto;padding:24px 16px 48px}
header{display:flex;justify-content:space-between;gap:18px;align-items:center;flex-wrap:wrap;padding:8px 2px 2px}.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}h1{font-family:Georgia,serif;font-size:clamp(2rem,7vw,3.4rem);margin:.1rem 0;letter-spacing:.04em}.muted{color:var(--muted)}.card{background:var(--paper);border:1px solid var(--edge);border-top:2px solid var(--gold2);border-radius:14px;padding:18px;margin-top:16px;box-shadow:var(--shadow);backdrop-filter:blur(8px)}.hero{padding:22px}.hero h2{font-family:Georgia,serif;font-size:clamp(1.45rem,5vw,2.15rem);margin:.15rem 0 .4rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grow{flex:1 1 240px}.status{padding:13px;border:1px solid var(--edge);border-radius:10px;background:rgba(255,255,255,.72)}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#7d776d;margin-right:7px}.ok .dot{background:#25823b}.bad .dot{background:#b22d24}.warn .dot{background:#b27a12}label{display:block;font-size:.82rem;font-weight:800;margin:0 0 6px}textarea,input{width:100%;font:inherit;color:var(--ink);background:#fff;border:1px solid #c9c2b7;border-radius:10px;padding:12px;outline:none}textarea{min-height:160px;resize:vertical;line-height:1.5}textarea:focus,input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(167,122,33,.12)}button{background:#171717;color:#fff;border:1px solid #171717;border-radius:9px;padding:10px 14px;font-weight:800;cursor:pointer}button.secondary{background:#fff;color:#171717;border-color:#b9b1a4}button.gold{background:linear-gradient(180deg,#b58a32,#8d6419);border-color:#8d6419}button:disabled{opacity:.5;cursor:not-allowed}code,pre{background:#f1efe9;border-radius:6px}code{padding:.15rem .35rem}pre{padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-word;max-height:320px}.composer-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.voice-state{font-size:.86rem;margin-top:8px}.mission{padding:13px;border:1px solid var(--edge);border-left:3px solid var(--gold);border-radius:10px;background:rgba(255,255,255,.72);margin-top:10px}.mission strong{font-family:Georgia,serif}.pill{display:inline-block;font-size:.72rem;font-weight:800;border:1px solid #cfc6b7;border-radius:999px;padding:3px 7px;margin:5px 5px 0 0;background:#fff}.success{color:#236a34}.error{color:#9c251f}details{margin-top:12px}summary{cursor:pointer;font-weight:800}.dropzone{margin-top:14px;padding:18px;border:1.5px dashed #aa9470;border-radius:12px;background:rgba(255,255,255,.58);text-align:center;transition:.15s ease}.dropzone.drag{border-color:var(--gold);background:rgba(211,183,110,.16);transform:translateY(-1px)}.context-item{display:flex;align-items:flex-start;gap:9px;padding:10px;border:1px solid var(--edge);border-radius:9px;background:#fff;margin-top:8px;font-weight:400}.context-item input{width:auto;margin-top:3px}.context-meta{font-size:.78rem;color:var(--muted);word-break:break-all}@media(max-width:600px){.wrap{padding:14px 10px 36px}.card{padding:15px}.composer-actions button{flex:1 1 150px}}
</style></head><body><main class="wrap">
<header><div><div class="eyebrow">Knowledge · Investigation · Narrative · Generation · System</div><h1>K.I.N.G.S. AI</h1><div class="muted">Owner command console · local coding authority</div></div><button class="secondary" onclick="refreshAll()">Refresh</button></header>
<section class="card hero"><div class="eyebrow">Owner Vision</div><h2>Talk to K.I.N.G.S.</h2><p class="muted">Describe the application, feature, repair, or system you want built. Speak naturally or type it. K.I.N.G.S. stores the approved vision as a persistent mission and turns it into governed executable work.</p><label for="vision">What should K.I.N.G.S. build?</label><textarea id="vision" placeholder="Example: Build a mobile-first collector application that catalogs cards, recognizes items from photos, tracks value, and verifies every feature with real tests before release."></textarea><div id="voice-state" class="muted voice-state">Voice dictation availability depends on this browser. Text input always works.</div><details><summary>Advanced details</summary><div style="margin-top:10px"><label for="product-name">Mission / product name (optional)</label><input id="product-name" maxlength="160" placeholder="K.I.N.G.S. can derive this from your vision"></div></details><div class="dropzone" id="context-drop"><strong>Project context PDFs</strong><div class="muted" style="margin:6px 0 10px">Drop PDFs here or choose files. Extraction and storage happen inside the K.I.N.G.S. runtime; the browser never supplies extracted text.</div><input id="pdf-input" type="file" accept="application/pdf,.pdf" multiple hidden><button type="button" class="secondary" onclick="document.getElementById('pdf-input').click()">Choose PDFs</button><div id="context-upload-status" class="muted" style="margin-top:8px"></div></div><div id="context-list" class="muted" style="margin-top:10px">Loading project context…</div><div class="composer-actions"><button id="voice-button" class="secondary" onclick="toggleVoice()">🎙 Talk</button><button id="build-button" class="gold" onclick="buildVision()">Build From This Vision</button></div><div id="mission-create-status" class="muted" style="margin-top:12px"></div></section>
<section class="card"><div class="row"><div class="grow"><h2 style="margin:.1rem 0">Mission Control</h2><div class="muted">Persistent missions survive K.I.N.G.S. runtime restarts.</div></div><button class="secondary" onclick="refreshMissions()">Refresh Missions</button></div><div id="missions" class="muted" style="margin-top:10px">Loading…</div></section>
<section class="card"><h2>Runtime</h2><div id="runtime" class="muted">Loading…</div></section>
<section class="card"><h2>AI Connectors</h2><div id="connectors" class="grid"></div></section>
<section class="card"><h2>Governed Engineering</h2><p class="muted">Only the repository-native build/test plan for the server-configured workspace can run here. Browser requests cannot supply a shell command, executable, arguments, or alternate path.</p><p><strong>Workspace:</strong> <code id="engineering-workspace">Loading…</code></p><div class="row"><button id="engineering-readiness" class="secondary" onclick="startEngineering('readiness')">Inspect Readiness</button><button id="engineering-verify" onclick="startEngineering('verify')">Run Governed Verify</button></div><div id="engineering-status" class="muted" style="margin-top:12px">Loading…</div><pre id="engineering-evidence" hidden></pre></section>
</main><script>
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let recognition=null,listening=false,speechPrefix='',contextUploadBusy=false;const selectedContextIds=new Set();
function setVoiceState(text,cls='muted'){const el=document.getElementById('voice-state');el.className=cls+' voice-state';el.textContent=text;}
function ensureRecognition(){if(recognition)return recognition;const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C)return null;recognition=new C();recognition.continuous=true;recognition.interimResults=true;recognition.lang=navigator.language||'en-US';recognition.onstart=()=>{listening=true;speechPrefix=document.getElementById('vision').value.trim();document.getElementById('voice-button').textContent='■ Stop';setVoiceState('Listening… speak your full software vision.','success');};recognition.onresult=e=>{let finalText='',interim='';for(let i=0;i<e.results.length;i++){const text=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=text+' ';else interim+=text;}document.getElementById('vision').value=[speechPrefix,finalText.trim(),interim.trim()].filter(Boolean).join(' ').trim();};recognition.onerror=e=>{setVoiceState('Voice dictation error: '+String(e.error||'unknown')+'. You can keep typing.','error');};recognition.onend=()=>{listening=false;document.getElementById('voice-button').textContent='🎙 Talk';if(!document.getElementById('voice-state').classList.contains('error'))setVoiceState('Voice dictation stopped. Review or edit the vision, then build it.');};return recognition;}
function toggleVoice(){const r=ensureRecognition();if(!r){setVoiceState('This browser does not expose speech recognition. Type your vision instead.','error');return;}try{if(listening)r.stop();else r.start();}catch(e){setVoiceState('Could not start voice dictation: '+e.message,'error');}}
function toggleContext(id,checked){if(checked)selectedContextIds.add(id);else selectedContextIds.delete(id);}
function renderContextDocument(document){const checked=selectedContextIds.has(document.id)?' checked':'';return '<label class="context-item"><input type="checkbox" data-context-id="'+esc(document.id)+'"'+checked+' onchange="toggleContext(this.dataset.contextId,this.checked)"><span><strong>'+esc(document.name)+'</strong><div class="context-meta">'+document.pageCount+' page(s) · '+document.characterCount+' extracted characters · SHA-256 '+esc(document.sha256.slice(0,16))+'… · source preserved</div></span></label>';}
async function refreshContext(){const el=document.getElementById('context-list');try{const r=await fetch('/api/context',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();const valid=new Set(d.documents.map(item=>item.id));for(const id of [...selectedContextIds])if(!valid.has(id))selectedContextIds.delete(id);el.innerHTML=d.documents.length?'<div class="muted">Select the imported documents that belong to this mission:</div>'+d.documents.map(renderContextDocument).join(''):'No project PDFs imported yet.';}catch(e){el.textContent='Project context unavailable: '+e.message;}}
async function uploadPdfs(fileList){if(contextUploadBusy)return;const files=[...fileList];if(!files.length)return;const status=document.getElementById('context-upload-status');contextUploadBusy=true;try{for(const file of files){if(file.size>20*1024*1024)throw new Error(file.name+' exceeds the 20 MiB PDF limit.');if(file.type&&file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw new Error(file.name+' is not a PDF.');status.className='muted';status.textContent='Importing '+file.name+'…';const r=await fetch('/api/context/pdf',{method:'POST',headers:{'content-type':'application/pdf','x-kings-owner-action':'import-pdf','x-kings-file-name':encodeURIComponent(file.name)},body:file});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||('HTTP '+r.status));selectedContextIds.add(d.document.id);status.className='success';status.textContent='Imported '+d.document.name+' · '+d.document.pageCount+' page(s) · source preserved and verified.';}await refreshContext();}catch(e){status.className='error';status.textContent='PDF import failed: '+e.message;}finally{contextUploadBusy=false;}}
async function buildVision(){const vision=document.getElementById('vision').value.trim();const name=document.getElementById('product-name').value.trim();const status=document.getElementById('mission-create-status');const button=document.getElementById('build-button');if(vision.length<8){status.className='error';status.textContent='Describe what you want K.I.N.G.S. to build first.';return;}button.disabled=true;status.className='muted';status.textContent='Creating persistent K.I.N.G.S. mission…';try{const r=await fetch('/api/missions',{method:'POST',headers:{'content-type':'application/json','x-kings-owner-action':'create-mission'},body:JSON.stringify({ownerVision:vision,contextDocumentIds:[...selectedContextIds],...(name?{productName:name}:{})})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||('HTTP '+r.status));status.className='success';status.textContent='Mission created: '+d.mission.name+' · '+d.tasks.length+' governed tasks · '+d.execution.runnableTaskIds.length+' runnable now · '+d.contextDocuments.length+' project document(s) attached.';await refreshMissions();}catch(e){status.className='error';status.textContent='Could not create mission: '+e.message;}finally{button.disabled=false;}}
function renderMission(m){const runnable=m.execution?.runnableTaskIds?.length||0,blocked=m.execution?.blockedTaskIds?.length||0,done=m.execution?.completedTaskIds?.length||0,context=m.contextDocuments?.length||0;return '<div class="mission"><strong>'+esc(m.mission.name)+'</strong><div class="muted">'+esc(m.mission.id)+'</div><span class="pill">'+esc(m.mission.status)+'</span><span class="pill">'+m.tasks.length+' tasks</span><span class="pill">'+runnable+' runnable</span><span class="pill">'+blocked+' waiting</span><span class="pill">'+done+' complete</span><span class="pill">'+context+' context docs</span><span class="pill">plan '+(m.plan.approvedByHuman&&m.plan.locked?'approved + locked':'not locked')+'</span></div>';}
async function refreshMissions(){const el=document.getElementById('missions');try{const r=await fetch('/api/missions',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();el.innerHTML=d.missions.length?d.missions.map(renderMission).join(''):'No owner missions yet. Tell K.I.N.G.S. what to build above.';}catch(e){el.textContent='Mission state unavailable: '+e.message;}}
async function refreshStatus(){try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();document.getElementById('runtime').innerHTML=esc(d.platform)+' · Node '+esc(d.node)+' · '+esc(d.hostname);document.getElementById('connectors').innerHTML=d.connectors.map(c=>{const cls=!c.configured?'warn':c.reachable?'ok':'bad';const label=!c.configured?'not configured':c.reachable?'reachable':'unreachable';return '<div class="status '+cls+'"><strong><span class="dot"></span>'+esc(c.label)+'</strong><div class="muted">'+esc(label)+(c.status?' · HTTP '+esc(c.status):'')+'</div></div>'}).join('');}catch(e){document.getElementById('runtime').textContent='Status unavailable';}}
function summarizeEngineering(job){if(!job)return 'No engineering job has run yet.';if(job.status==='running')return esc(job.action)+' job running since '+esc(job.startedAt);const result=job.result;if(result?.verify){const v=result.verify;return esc(job.action)+' · '+esc(job.status)+' · '+(v.verified?'VERIFIED':'NOT VERIFIED')+(v.failureReason?' · '+esc(v.failureReason):'');}if(result?.readiness){return esc(job.action)+' · '+esc(job.status)+' · readiness '+esc(result.readiness.status);}return esc(job.action)+' · '+esc(job.status)+(job.error?' · '+esc(job.error):'');}
function evidenceText(job){const result=job?.result;if(!result)return job?.error||'';const lines=[];if(result.readiness){lines.push('Readiness: '+result.readiness.status);lines.push('Languages: '+(result.readiness.detectedLanguages||[]).join(', '));lines.push('Package managers: '+(result.readiness.packageManagers||[]).join(', '));for(const step of result.readiness.plannedSteps||[])lines.push('Plan '+step.sequence+': '+step.language+' '+step.operation);}if(result.verify){for(const entry of result.verify.evidence||[]){lines.push('');lines.push((entry.succeeded?'PASS ':'FAIL ')+entry.sequence+' '+entry.operation+' exit='+String(entry.exitCode)+' '+entry.durationMs+'ms');if(!entry.succeeded&&entry.stderr)lines.push(entry.stderr);}}if(job.error)lines.push('\nError: '+job.error);return lines.join('\n');}
async function refreshEngineering(){try{const r=await fetch('/api/engineering',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();document.getElementById('engineering-workspace').textContent=d.workspace;const running=d.job?.status==='running';document.getElementById('engineering-readiness').disabled=running||!d.controlReady;document.getElementById('engineering-verify').disabled=running||!d.controlReady;document.getElementById('engineering-status').innerHTML=summarizeEngineering(d.job);const pre=document.getElementById('engineering-evidence');const text=evidenceText(d.job);pre.textContent=text;pre.hidden=!text;if(running)setTimeout(refreshEngineering,1500);}catch(e){document.getElementById('engineering-status').textContent='Engineering status unavailable';}}
async function startEngineering(action){if(action!=='readiness'&&action!=='verify')return;const readiness=document.getElementById('engineering-readiness'),verify=document.getElementById('engineering-verify');readiness.disabled=true;verify.disabled=true;try{const r=await fetch('/api/engineering/'+action,{method:'POST',headers:{'x-kings-owner-action':action}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||('HTTP '+r.status));document.getElementById('engineering-status').textContent=action+' job started.';setTimeout(refreshEngineering,350);}catch(e){document.getElementById('engineering-status').textContent='Could not start engineering job: '+e.message;await refreshEngineering();}}
async function refreshAll(){await Promise.all([refreshContext(),refreshMissions(),refreshStatus(),refreshEngineering()]);}
const drop=document.getElementById('context-drop'),pdfInput=document.getElementById('pdf-input');for(const eventName of ['dragenter','dragover'])drop.addEventListener(eventName,event=>{event.preventDefault();drop.classList.add('drag');});for(const eventName of ['dragleave','drop'])drop.addEventListener(eventName,event=>{event.preventDefault();drop.classList.remove('drag');});drop.addEventListener('drop',event=>uploadPdfs(event.dataTransfer?.files||[]));pdfInput.addEventListener('change',event=>{uploadPdfs(event.target.files||[]);event.target.value='';});if(!(window.SpeechRecognition||window.webkitSpeechRecognition))setVoiceState('Voice dictation is not available in this browser. Text input is fully supported.');refreshAll();setInterval(refreshStatus,15000);setInterval(()=>{const text=document.getElementById('engineering-status')?.textContent||'';if(!/running/i.test(text))refreshEngineering();},15000);
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
    const results = await Promise.all(connectors.map(probe));
    return json(res, 200, {
      ok: true,
      platform: process.platform,
      node: process.version,
      hostname: os.hostname(),
      connectors: results,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/context") {
    return json(res, 200, {
      ok: true,
      documents: ownerPdfContextRuntime.list(),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/context/pdf") {
    if (!engineeringActionHeaderMatches(req, "import-pdf")) {
      return json(res, 400, {
        ok: false,
        error: "pdf_import_confirmation_required",
        message: "Set X-KINGS-Owner-Action to import-pdf to import project context.",
      });
    }
    const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
    if (!contentType.startsWith("application/pdf")) {
      return json(res, 415, {
        ok: false,
        error: "unsupported_pdf_media_type",
        message: "PDF context import requires Content-Type application/pdf.",
      });
    }
    try {
      const name = ownerPdfName(req);
      const bytes = await readRawBody(req, ownerPdfBodyLimit);
      const document = await ownerPdfContextRuntime.ingestPdf(name, bytes);
      return json(res, 201, {
        ok: true,
        document,
      });
    } catch (error) {
      return json(res, Number(error?.statusCode) || 400, {
        ok: false,
        error: "owner_pdf_import_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/missions") {
    return json(res, 200, {
      ok: true,
      missions: ownerMissionRuntime.list(),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/missions") {
    if (!engineeringActionHeaderMatches(req, "create-mission")) {
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
      const statusCode = Number(error?.statusCode) || 400;
      return json(res, statusCode, {
        ok: false,
        error: "owner_mission_creation_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const missionMatch = url.pathname.match(/^\/api\/missions\/([^/]+)$/u);
  if (req.method === "GET" && missionMatch) {
    try {
      const missionId = decodeURIComponent(missionMatch[1]);
      return json(res, 200, {
        ok: true,
        ...ownerMissionRuntime.snapshot(missionId),
      });
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
    if (!engineeringActionHeaderMatches(req, action)) {
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
  console.log("K.I.N.G.S. persistent owner mission + PDF context runtime: ready");
});

function stopEngineeringChild() {
  if (engineeringChild && engineeringChild.exitCode === null) {
    engineeringChild.kill("SIGTERM");
  }
}

function shutdown() {
  stopEngineeringChild();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
