import http from "node:http";
import os from "node:os";
import { readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { URL } from "node:url";

const port = Number(process.env.KINGS_CODING_MACHINE_PORT ?? 8787);
const host = String(process.env.KINGS_CODING_MACHINE_BIND ?? "127.0.0.1").trim();
const timeoutMs = Number(process.env.KINGS_CONNECTOR_HEALTH_TIMEOUT_MS ?? 1500);
const ownerToken = String(process.env.KINGS_CODING_MACHINE_TOKEN ?? "").trim();
const ownerCookieName = "__Host-kings_owner_access";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const remoteMode = !loopbackHosts.has(host);
const royalCss = readFileSync(new URL("../../native-shell/royal.css", import.meta.url), "utf8");
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
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark">
<title>K.I.N.G.S. AI — Owner Command Palace</title>
<style>${royalCss}
body{display:block}.palace{width:min(1180px,100%);margin:auto;padding:22px 20px 58px}.dais{position:relative;overflow:hidden;padding:24px 26px;margin-bottom:18px;border:1px solid var(--kings-border-strong);border-radius:22px;background:linear-gradient(145deg,var(--kings-black-soft),var(--kings-black));color:#f4eee2;box-shadow:var(--kings-shadow)}
.dais::before,.dais::after{content:"";position:absolute;left:18px;right:18px;height:1px;background:linear-gradient(90deg,transparent,var(--kings-gold-bright),transparent);opacity:.58}.dais::before{top:10px}.dais::after{bottom:10px}.dais-grid{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:20px;align-items:center}.crown{width:68px;height:78px;border-radius:36px 36px 14px 14px;font-size:2.5rem}.dais .kings-eyebrow{color:#a9987d}.dais h1{margin:2px 0 4px;color:#fff8eb;font-size:clamp(1.8rem,6vw,3.4rem);line-height:1;letter-spacing:.12em}.dais p{margin:0;color:#c9bdac;font-size:.82rem}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.actions button{color:#f4eee2;background:rgba(255,255,255,.04)}
.court-grid{display:grid;grid-template-columns:1fr 1.35fr;gap:18px}.card{padding:20px}.card h2{margin:2px 0 12px;font-size:1.12rem}.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}.badge{display:inline-flex;align-items:center;min-height:27px;padding:4px 9px;border:1px solid var(--kings-border);border-radius:999px;color:var(--kings-muted);background:var(--kings-panel-soft);font-size:.62rem;font-weight:800;letter-spacing:.11em}.runtime-line{padding:15px;border-left:3px solid var(--kings-gold);border-radius:0 10px 10px 0;background:var(--kings-panel-soft);color:var(--kings-muted);line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.status{min-height:104px;padding:14px;border:1px solid var(--kings-border);border-radius:12px;background:var(--kings-panel-soft)}.status strong{display:block;margin-bottom:7px;font-family:"Libre Baskerville",Georgia,serif}.status .state{font-size:.78rem;color:var(--kings-muted)}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--kings-faint);margin-right:7px;box-shadow:0 0 0 3px rgba(0,0,0,.03)}.ok .dot{background:var(--kings-success)}.bad .dot{background:var(--kings-danger)}.warn .dot{background:var(--kings-warning)}
.governance{grid-column:1/-1}.law-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.law{padding:13px;border-top:2px solid var(--kings-gold);background:var(--kings-panel-soft);border-radius:0 0 10px 10px}.law strong{display:block;margin-bottom:5px;font-family:"Libre Baskerville",Georgia,serif;font-size:.84rem}.law span{color:var(--kings-muted);font-size:.76rem;line-height:1.5}.foot{text-align:center;padding:22px 5px 0;color:var(--kings-faint);font-size:.62rem;font-weight:800;letter-spacing:.14em}.foot b{color:var(--kings-gold)}
@media(max-width:760px){.palace{padding:14px 13px 40px}.dais{padding:22px 17px}.dais-grid{grid-template-columns:auto minmax(0,1fr)}.actions{grid-column:1/-1;justify-content:stretch}.actions button{flex:1}.court-grid{grid-template-columns:1fr}.governance{grid-column:auto}.law-grid{grid-template-columns:1fr}.crown{width:54px;height:62px;font-size:2rem}.card{padding:17px}}
</style></head><body><main class="palace">
<header class="dais"><div class="dais-grid"><div class="crown kings-seal" aria-hidden="true">♛</div><div><div class="kings-eyebrow">KNOWLEDGE · INVESTIGATION · NARRATIVE · GENERATION · SYSTEM</div><h1 class="kings-display">K.I.N.G.S.</h1><p class="kings-serif">Owner Command Palace · governed AI engineering runtime</p></div><div class="actions"><button id="theme-toggle" class="kings-button kings-theme-toggle" type="button" aria-pressed="false">Dark court</button><button class="kings-button" type="button" onclick="refresh()">Refresh court</button></div></div></header>
<div class="court-grid">
<section class="card kings-panel kings-panel-strong" aria-labelledby="runtime-title"><div class="card-head"><div><div class="kings-eyebrow">THRONE ROOM</div><h2 id="runtime-title" class="kings-serif">Runtime Authority</h2></div><span class="badge">OWNER</span></div><div id="runtime" class="runtime-line">Reading the royal runtime ledger…</div></section>
<section class="card kings-panel kings-panel-strong" aria-labelledby="connectors-title"><div class="card-head"><div><div class="kings-eyebrow">THE MODEL COURT</div><h2 id="connectors-title" class="kings-serif">AI Connectors</h2></div><span class="badge">LIVE PROBES</span></div><div id="connectors" class="grid"></div></section>
<section class="card kings-panel governance" aria-labelledby="governance-title"><div class="card-head"><div><div class="kings-eyebrow">ROYAL LAW</div><h2 id="governance-title" class="kings-serif">Governed Engineering</h2></div><span class="badge">FAIL CLOSED</span></div><div class="law-grid"><div class="law"><strong>Context discipline</strong><span>Mission memory and context budgets stay bounded by the workforce authorities.</span></div><div class="law"><strong>Model sovereignty</strong><span>Routing, provider fallback, cost ceilings and local-only policy remain enforced below this console.</span></div><div class="law"><strong>Verified work</strong><span>Filesystem changes, builds, tests and recovery must cross their real authorization and evidence gates.</span></div></div></section>
</div><footer class="foot"><b>♛</b> K.I.N.G.S. OWNER AUTHORITY · SECURE GOVERNED RUNTIME <b>♛</b></footer>
</main><script>
const THEME_KEY='kings-ui-theme';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function applyTheme(theme,persist){const next=theme==='dark'?'dark':'light';if(next==='dark')document.documentElement.dataset.kingsTheme='dark';else delete document.documentElement.dataset.kingsTheme;document.documentElement.style.colorScheme=next;const button=document.getElementById('theme-toggle');button.textContent=next==='dark'?'Light court':'Dark court';button.setAttribute('aria-pressed',String(next==='dark'));if(persist)localStorage.setItem(THEME_KEY,next)}
function preferredTheme(){const saved=localStorage.getItem(THEME_KEY);if(saved==='light'||saved==='dark')return saved;return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.getElementById('theme-toggle').addEventListener('click',()=>applyTheme(document.documentElement.dataset.kingsTheme==='dark'?'light':'dark',true));
async function refresh(){try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();document.getElementById('runtime').innerHTML='<strong>'+esc(d.platform)+'</strong><br>Node '+esc(d.node)+' · host '+esc(d.hostname);document.getElementById('connectors').innerHTML=d.connectors.map(c=>{const cls=!c.configured?'warn':c.reachable?'ok':'bad';const label=!c.configured?'Not configured':c.reachable?'Reachable':'Unreachable';return '<div class="status '+cls+'"><strong><span class="dot"></span>'+esc(c.label)+'</strong><div class="state">'+esc(label)+(c.status?' · HTTP '+esc(c.status):'')+'</div></div>'}).join('')}catch(e){document.getElementById('runtime').textContent='Runtime status unavailable';}}
applyTheme(preferredTheme(),false);refresh();setInterval(refresh,15000);
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
