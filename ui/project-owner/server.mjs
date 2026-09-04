import http from "node:http";
import os from "node:os";
import { URL } from "node:url";

const port = Number(process.env.KINGS_CODING_MACHINE_PORT ?? 8787);
const host = process.env.KINGS_CODING_MACHINE_BIND ?? "127.0.0.1";
const timeoutMs = Number(process.env.KINGS_CONNECTOR_HEALTH_TIMEOUT_MS ?? 1500);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("KINGS_CODING_MACHINE_PORT must be a valid TCP port");
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

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
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
async function refresh(){try{const d=await fetch('/api/status',{cache:'no-store'}).then(r=>r.json());
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
  console.log(`K.I.N.G.S. Owner Console: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
});
