import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const picture = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2TkZkAAAAASUVORK5CYII=";
const token = "test-owner-token-" + randomUUID();
const mockAssessment = {
  identification: { name: "Test TCG item", details: "Front photo only", confidence: "low" },
  condition: { summary: "Test photo appears to show edge wear.", observations: [
    { photoIndex: 0, area: "top edge", observation: "Faint whitening", severity: "minor" }
  ], gradeEstimate: { basis: "photo_estimate", low: 6, high: 8, confidence: "low" } },
  authenticityFlags: ["Authentication requires professional review"],
  limitations: ["Reverse not supplied"],
  recommendedNextSteps: ["Capture back and corner close-ups"]
};
function port() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close(err => err ? reject(err) : resolvePort(value));
    });
  });
}
async function ready(base, child, output) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error("Owner console exited: " + output());
    try { if ((await fetch(base + "/health")).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 40));
  }
  throw Error("Owner console did not start: " + output());
}
async function shutdown(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
  try { await once(child, "exit"); } finally { clearTimeout(timeout); }
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "kings-collectible-http-"));
  const ownerPort = await port();
  let requests = 0;
  let seenImage = false;
  const provider = http.createServer(async (req, res) => {
    try {
      assert.equal(req.url, "/v1/chat/completions");
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const user = body.messages[1].content;
      seenImage = Array.isArray(user) && user.some(part =>
        part.type === "image_url" && part.image_url.url.startsWith("data:image/png;base64,"));
      requests++;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(mockAssessment) } }],
        usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 }
      }));
    } catch (error) {
      res.writeHead(500); res.end(String(error));
    }
  });
  await new Promise(ok => provider.listen(0, "127.0.0.1", ok));
  const address = provider.address();
  const env = {
    ...process.env,
    KINGS_CODING_MACHINE_BIND: "0.0.0.0",
    KINGS_CODING_MACHINE_PORT: String(ownerPort),
    KINGS_CODING_MACHINE_TOKEN: token,
    KINGS_CODING_MACHINE_WORKSPACE: root,
    KINGS_OWNER_MISSION_STORE: join(dir, "missions.json"),
    KINGS_OWNER_CONTEXT_STORE: join(dir, "context.json"),
    KINGS_COLLECTIBLES_REPORT_STORE: join(dir, "collectibles.json"),
    KINGS_OMNIROUTE_BASE_URL: "http://127.0.0.1:" + address.port + "/v1",
    KINGS_OMNIROUTE_MODELS: "vision-model",
    KINGS_OMNIROUTE_VISION_MODELS: "vision-model",
    KINGS_APP_ROUTER_PROVIDER_ORDER: "omniroute",
  };
  for (const key of ["KINGS_9ROUTER_BASE_URL", "KINGS_9ROUTER_HOSTPORT",
    "KINGS_9ROUTER_MODELS", "KINGS_9ROUTER_VISION_MODELS",
    "KINGS_OLLAMA_BASE_URL", "KINGS_OLLAMA_MODEL", "KINGS_OLLAMA_MODELS"]) delete env[key];
  const child = spawn(process.execPath, ["ui/project-owner/server.mjs"], { cwd: root,
    env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const base = "http://127.0.0.1:" + ownerPort;
  try {
    await ready(base, child, () => output);
    const unauthorized = await fetch(base + "/api/collectibles/reports");
    assert.equal(unauthorized.status, 401, "Remote owner report history must be protected");
    const pageUnauthorized = await fetch(base + "/collectibles");
    assert.equal(pageUnauthorized.status, 401, "Office page must be protected");

    const headers = { authorization: "Bearer " + token };
    const page = await fetch(base + "/collectibles", { headers });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Collectibles Intelligence/);
    const empty = await (await fetch(base + "/api/collectibles/reports", { headers })).json();
    assert.deepEqual(empty.reports, []);
    const payload = { category: "tcg", itemName: "Test TCG card", photos: [{
      filename: "front.png", mimeType: "image/png", base64: picture
    }] };
    const unconfirmed = await fetch(base + "/api/collectibles/assess", {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(unconfirmed.status, 400);
    assert.equal(requests, 0, "Missing owner confirmation must not invoke any model");
    const blockedUnauthenticatedSubmit = await fetch(base + "/api/collectibles/assess", {
      method: "POST", headers: { "content-type": "application/json",
        "x-kings-owner-action": "assess-collectible" }, body: JSON.stringify(payload),
    });
    assert.equal(blockedUnauthenticatedSubmit.status, 401, "No unauthorized assessment request may reach the provider");
    assert.equal(requests, 0);
    const spoofedImage = await fetch(base + "/api/collectibles/assess", {
      method: "POST", headers: { ...headers, "content-type": "application/json",
        "x-kings-owner-action": "assess-collectible" },
      body: JSON.stringify({ ...payload, photos: [{ filename: "fake.jpg",
        mimeType: "image/jpeg", base64: picture }] }),
    });
    assert.equal(spoofedImage.status, 415, "Image magic bytes must match declared MIME type");
    assert.equal(requests, 0, "Spoofed images may not reach the vision provider");
    const confirmed = await fetch(base + "/api/collectibles/assess", {
      method: "POST", headers: { ...headers, "content-type": "application/json",
        "x-kings-owner-action": "assess-collectible" },
      body: JSON.stringify(payload),
    });
    const result = await confirmed.json();
    assert.equal(confirmed.status, 201, JSON.stringify(result));
    assert.equal(result.report.evidence.modelProvider, "omniroute");
    assert.equal(result.report.condition.gradeEstimate.low, 6);
    assert.equal(result.report.authenticity.status, "unverified");
    assert.equal(requests, 1);
    assert.equal(seenImage, true, "Actual base64 image input must reach routed model");
    const saved = await readFile(join(dir, "collectibles.json"), "utf8");
    assert.equal(saved.includes(picture), false, "Source photo bytes must not persist");
    const history = await (await fetch(base + "/api/collectibles/reports", { headers })).json();
    assert.equal(history.reports.length, 1);
    assert.equal(history.reports[0].id, result.report.id);
    console.log("Authenticated K.I.N.G.S. collectible office HTTP integration: PASSED");
  } finally {
    await shutdown(child);
    await new Promise(done => provider.close(done));
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
