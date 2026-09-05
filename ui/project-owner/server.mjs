import http from "node:http";
import os from "node:os";
import { createHash, timingSafeEqual } from "node:crypto";
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
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.status{padding:14px;border:1px solid #303846;border-radius:12px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#7d8590;margin-right:7px}
.ok .dot{background:#3fb950}.bad .dot{background:#f85149}.warn .dot{background:#d29922}
code{background:#0b0d12;padding:.15rem .35rem;border-radius:5px}button{background:#f3f5f7;color:#111;border:0;border-radius:9px;padding:10px 14px;font-weight:700;cursor:pointer}
</style></head><body><main class="wrap">
<header><div><div class="muted">Project Owner Runtime</div><h1>K.I.N.G.S. AI</h1><div class="muted">Cross-platform operational console</div></div><button onclick="refresh()">Refresh</button></header>
<section class="card"><h2>Runtime</h2><div id="runtime" class="muted">Loading…</div></section>
<section class="card"><h2>AI Connectors</h2><div id="connectors" class="grid"></div></section>
<section class="card"><h2>Token controls</h2><p class="muted">Context budgets, model output caps, provider-side routing/caching, and measured usage remain enforced by the K.I.N.G.S. workforce runtime.</p></section>
</main><script>
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function refresh(){try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();
document.getElementById('runtime').innerHTML=esc(d.platform)+' · Node '+esc(d.node)+' · '+esc(d.hostname);
document.getElementById('connectors').innerHTML=d.connectors.map(c=>{
const cls=!c.configured?'warn':c.reachable?'ok':'bad';const label=!c.configured?'not configured':c.reachable?'reachable':'unreachable';
return '<div class="status '+cls+'"><strong><span class="dot"></span>'+esc(c.label)+'</strong><div class="muted">'+esc(label)+(c.status?' · HTTP '+esc(c.status):'')+'</div></div>'}).join('');
}catch(e){document.getElementById('runtime').textContent='Status unavailable';}}
refresh();setInterval(refresh,15000);
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
});
