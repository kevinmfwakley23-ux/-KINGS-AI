import http from "node:http";
import os from "node:os";
import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { URL } from "node:url";

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
const engineeringOutputLimit = 1024 * 1024;
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
      method: "GET", headers, signal: controller.signal,
    });
    return {
      id: connector.id, label: connector.label, configured: true,
      reachable: response.ok, status: response.status,
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
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:dark;background:#0b0d12;color:#f3f5f7}
*{box-sizing:border-box}body{margin:0}.wrap{max-width:980px;margin:auto;padding:28px 18px}
header{display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap}
h1{font-size:clamp(1.6rem,5vw,2.7rem);margin:.2rem 0}.muted{color:#a9b1bd}.card{background:#131720;border:1px solid #282f3a;border-radius:16px;padding:18px;margin-top:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.status{padding:14px;border:1px solid #303846;border-radius:12px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#7d8590;margin-right:7px}
.ok .dot{background:#3fb950}.bad .dot{background:#f85149}.warn .dot{background:#d29922}
code,pre{background:#0b0d12;border-radius:5px}code{padding:.15rem .35rem}pre{padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-word;max-height:320px}
button{background:#f3f5f7;color:#111;border:0;border-radius:9px;padding:10px 14px;font-weight:700;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}
</style></head><body><main class="wrap">
<header><div><div class="muted">Project Owner Runtime</div><h1>K.I.N.G.S. AI</h1><div class="muted">Cross-platform operational console</div></div><button onclick="refreshAll()">Refresh</button></header>
<section class="card"><h2>Runtime</h2><div id="runtime" class="muted">Loading…</div></section>
<section class="card"><h2>AI Connectors</h2><div id="connectors" class="grid"></div></section>
<section class="card"><h2>Governed Engineering</h2><p class="muted">The console can inspect or run only the repository-native build/test plan for the server-configured workspace. No browser request can supply a shell command, executable, arguments, or alternate path.</p><p><strong>Workspace:</strong> <code id="engineering-workspace">Loading…</code></p><div class="row"><button id="engineering-readiness" onclick="startEngineering('readiness')">Inspect Readiness</button><button id="engineering-verify" onclick="startEngineering('verify')">Run Governed Verify</button></div><div id="engineering-status" class="muted" style="margin-top:12px">Loading…</div><pre id="engineering-evidence" hidden></pre></section>
<section class="card"><h2>Token controls</h2><p class="muted">Context budgets, model output caps, provider-side routing/caching, and measured usage remain enforced by the K.I.N.G.S. workforce runtime.</p></section>
</main><script>
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function refreshStatus(){try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();
document.getElementById('runtime').innerHTML=esc(d.platform)+' · Node '+esc(d.node)+' · '+esc(d.hostname);
document.getElementById('connectors').innerHTML=d.connectors.map(c=>{const cls=!c.configured?'warn':c.reachable?'ok':'bad';const label=!c.configured?'not configured':c.reachable?'reachable':'unreachable';return '<div class="status '+cls+'"><strong><span class="dot"></span>'+esc(c.label)+'</strong><div class="muted">'+esc(label)+(c.status?' · HTTP '+esc(c.status):'')+'</div></div>'}).join('');
}catch(e){document.getElementById('runtime').textContent='Status unavailable';}}
function summarizeEngineering(job){if(!job)return 'No engineering job has run yet.';if(job.status==='running')return esc(job.action)+' job running since '+esc(job.startedAt);const result=job.result;if(result?.verify){const v=result.verify;return esc(job.action)+' · '+esc(job.status)+' · '+(v.verified?'VERIFIED':'NOT VERIFIED')+(v.failureReason?' · '+esc(v.failureReason):'');}if(result?.readiness){return esc(job.action)+' · '+esc(job.status)+' · readiness '+esc(result.readiness.status);}return esc(job.action)+' · '+esc(job.status)+(job.error?' · '+esc(job.error):'');}
function evidenceText(job){const result=job?.result;if(!result)return job?.error||'';const lines=[];if(result.readiness){lines.push('Readiness: '+result.readiness.status);lines.push('Languages: '+(result.readiness.detectedLanguages||[]).join(', '));lines.push('Package managers: '+(result.readiness.packageManagers||[]).join(', '));for(const step of result.readiness.plannedSteps||[])lines.push('Plan '+step.sequence+': '+step.language+' '+step.operation);}if(result.verify){for(const entry of result.verify.evidence||[]){lines.push('');lines.push((entry.succeeded?'PASS ':'FAIL ')+entry.sequence+' '+entry.operation+' exit='+String(entry.exitCode)+' '+entry.durationMs+'ms');if(!entry.succeeded&&entry.stderr)lines.push(entry.stderr);}}if(job.error)lines.push('\nError: '+job.error);return lines.join('\n');}
async function refreshEngineering(){try{const r=await fetch('/api/engineering',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();document.getElementById('engineering-workspace').textContent=d.workspace;const running=d.job?.status==='running';document.getElementById('engineering-readiness').disabled=running||!d.controlReady;document.getElementById('engineering-verify').disabled=running||!d.controlReady;document.getElementById('engineering-status').innerHTML=summarizeEngineering(d.job);const pre=document.getElementById('engineering-evidence');const text=evidenceText(d.job);pre.textContent=text;pre.hidden=!text;if(running)setTimeout(refreshEngineering,1500);}catch(e){document.getElementById('engineering-status').textContent='Engineering status unavailable';}}
async function startEngineering(action){if(action!=='readiness'&&action!=='verify')return;const readiness=document.getElementById('engineering-readiness'),verify=document.getElementById('engineering-verify');readiness.disabled=true;verify.disabled=true;try{const r=await fetch('/api/engineering/'+action,{method:'POST',headers:{'x-kings-owner-action':action}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||('HTTP '+r.status));document.getElementById('engineering-status').textContent=action+' job started.';setTimeout(refreshEngineering,350);}catch(e){document.getElementById('engineering-status').textContent='Could not start engineering job: '+e.message;await refreshEngineering();}}
async function refreshAll(){await Promise.all([refreshStatus(),refreshEngineering()]);}
refreshAll();setInterval(refreshStatus,15000);setInterval(()=>{const text=document.getElementById('engineering-status')?.textContent||'';if(!/running/i.test(text))refreshEngineering();},15000);
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
      ok: true, platform: process.platform, node: process.version,
      hostname: os.hostname(), connectors: results,
    });
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

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(port, host, () => {
  if (remoteMode) {
    console.log(`K.I.N.G.S. Owner Console: authenticated remote mode on ${host}:${port}; terminate transport at trusted HTTPS and bootstrap with ?access=<KINGS_CODING_MACHINE_TOKEN>`);
  } else {
    console.log(`K.I.N.G.S. Owner Console: http://${host}:${port}`);
  }
  console.log(`K.I.N.G.S. governed engineering workspace: ${engineeringWorkspace}`);
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
