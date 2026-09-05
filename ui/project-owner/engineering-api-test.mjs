import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = new URL("../../", import.meta.url);

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate engineering API test port."));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHealth(base, child, output) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Owner console exited before engineering API test.\n${output()}`);
    try { if ((await fetch(`${base}/health`, { cache: "no-store" })).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for owner console.\n${output()}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  timer.unref?.();
  await once(child, "exit");
  clearTimeout(timer);
}

async function json(base, path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    cache: "no-store",
    headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function main() {
  const temp = await mkdtemp(join(tmpdir(), "kings-owner-engineering-"));
  const project = join(temp, "fixture");
  const dataDir = join(temp, "owner-data");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "package.json"), JSON.stringify({
    name: "kings-owner-engineering-fixture",
    version: "1.0.0",
    private: true,
    packageManager: "npm@11.6.0",
    scripts: { build: "node build.mjs", test: "node test.mjs" },
  }, null, 2));
  await writeFile(join(project, "package-lock.json"), JSON.stringify({
    name: "kings-owner-engineering-fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "kings-owner-engineering-fixture", version: "1.0.0" } },
  }, null, 2));
  await writeFile(join(project, "source.js"), "export const answer = 42;\n");
  await writeFile(join(project, "build.mjs"), "import {mkdir,readFile,writeFile} from 'node:fs/promises'; const source=await readFile('source.js','utf8'); await mkdir('dist',{recursive:true}); await writeFile('dist/result.txt',source.includes('42')?'built-42':'bad');\n");
  await writeFile(join(project, "test.mjs"), "import {readFile} from 'node:fs/promises'; const value=await readFile('dist/result.txt','utf8'); if(value!=='built-42'){console.error('unexpected:'+value);process.exit(2)} console.log('fixture verification passed');\n");

  const port = await freePort();
  const child = spawn(process.execPath, ["ui/project-owner/server.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      KINGS_CODING_MACHINE_PORT: String(port),
      KINGS_CODING_MACHINE_BIND: "127.0.0.1",
      KINGS_CONNECTOR_HEALTH_TIMEOUT_MS: "40",
      KINGS_ENGINEERING_ROOTS: project,
      KINGS_CODING_MACHINE_DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  try {
    const base = `http://127.0.0.1:${port}`;
    await waitForHealth(base, child, () => output);

    const rootPage = await fetch(`${base}/`);
    assert.equal(rootPage.status, 200);
    assert.match(await rootPage.text(), /owner-engineering\.js/);
    const ui = await fetch(`${base}/owner-engineering.js`);
    assert.equal(ui.status, 200);
    assert.match(await ui.text(), /Owner Engineering Command Center/);

    const request = { projectId: "fixture", projectPath: project, operations: ["build", "test"] };
    const inspection = await json(base, "/api/engineering/inspect", "POST", request);
    assert.equal(inspection.response.status, 200, JSON.stringify(inspection.payload));
    assert.equal(inspection.payload.executionStatus, "ready", JSON.stringify(inspection.payload));
    assert.equal(inspection.payload.primaryLanguage, "javascript");
    assert.deepEqual(inspection.payload.packageManagers, ["npm"]);
    assert.ok(inspection.payload.verifications.some((item) => item.language === "javascript" && item.verified === true));
    assert.deepEqual(inspection.payload.steps.map((item) => item.operation), ["build", "test"]);

    const denied = await json(base, "/api/engineering/jobs", "POST", { ...request, authorizeExecution: false });
    assert.equal(denied.response.status, 400);
    assert.match(denied.payload.message, /Explicit owner execution authorization/);

    const outside = await json(base, "/api/engineering/inspect", "POST", { ...request, projectPath: dirname(project) });
    assert.equal(outside.response.status, 403);
    assert.match(outside.payload.message, /outside KINGS_ENGINEERING_ROOTS/);

    const started = await json(base, "/api/engineering/jobs", "POST", { ...request, authorizeExecution: true, timeoutMs: 30_000 });
    assert.equal(started.response.status, 202, JSON.stringify(started.payload));
    assert.match(started.payload.id, /^engineering-[a-f0-9-]{36}$/);
    assert.equal(started.payload.status, "running");

    let job = started.payload;
    const deadline = Date.now() + 30_000;
    while (!(["completed", "failed", "blocked"].includes(job.status)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const result = await json(base, `/api/engineering/jobs/${job.id}`);
      assert.equal(result.response.status, 200, JSON.stringify(result.payload));
      job = result.payload;
    }
    assert.equal(job.status, "completed", JSON.stringify(job));
    assert.equal(job.result.report.status, "completed");
    assert.deepEqual(job.result.report.evidence.map((item) => item.operation), ["build", "test"]);
    assert.ok(job.result.report.evidence.every((item) => item.succeeded === true));
    assert.match(job.result.report.evidence.at(-1).stdout, /fixture verification passed/);
    assert.equal(await readFile(join(project, "dist/result.txt"), "utf8"), "built-42");

    const persisted = JSON.parse(await readFile(join(dataDir, "engineering-jobs", `${job.id}.json`), "utf8"));
    assert.equal(persisted.status, "completed");
    assert.equal(persisted.result.report.evidence.length, 2);

    console.log("K.I.N.G.S. owner engineering command center API: SUCCESS");
  } finally {
    await stop(child);
    await rm(temp, { recursive: true, force: true });
  }
}

await main();
