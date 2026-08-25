import { createServer, type Server } from "node:https";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { TaskControl } from "../../core/workforce/task-control";
import { WorkforceRegistry } from "../../core/workforce/registry";
import { WorkUnitRegistry } from "../../core/workforce/work-unit-registry";
import { KingsCodingMachine } from "../../core/workforce/kings-coding-machine";
import type { ProjectOwnerExecutionContext } from "../../core/workforce/project-owner-machine-api";
import {
  ProjectOwnerMachineServerController,
  createDefaultProjectOwnerMissionFactory,
} from "./server-contract";
import { AuthorsForgeApi, type AuthorsForgeRequest } from "./authors-forge-api";

const root = process.cwd();
const certDir = process.env.KINGS_LOCAL_HTTPS_CERT_DIR ?? join(root, ".kings-local-https");
const kingsPort = Number(process.env.KINGS_CODING_MACHINE_HTTPS_PORT ?? 8787);
const forgePort = Number(process.env.AUTHORS_FORGE_HTTPS_PORT ?? 8788);
const kingsHost = process.env.KINGS_CODING_MACHINE_HTTPS_HOST ?? "kings.localhost";
const forgeHost = process.env.AUTHORS_FORGE_HTTPS_HOST ?? "authors-forge.localhost";
const workspaceRoot = process.env.KINGS_CODING_MACHINE_WORKSPACE ?? root;
const ollamaBaseUrl = process.env.KINGS_CODING_MACHINE_OLLAMA_URL ?? "http://127.0.0.1:11434";
const modelId = process.env.KINGS_CODING_MACHINE_MODEL ?? "qwen2.5-coder:1.5b";

async function parseBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function tls(host: string): Promise<{ key: Buffer; cert: Buffer }> {
  return {
    key: await readFile(join(certDir, `${host}.key.pem`)),
    cert: await readFile(join(certDir, `${host}.cert.pem`)),
  };
}

async function ollamaHealth(): Promise<{ ok: boolean; message: string; models?: string[] }> {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`);
    if (!response.ok) return { ok: false, message: `Ollama HTTP ${response.status}` };
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).map((model) => model.name).filter((name): name is string => Boolean(name));
    const available = models.some((name) => name === modelId || name.startsWith(`${modelId}:`));
    return {
      ok: available,
      message: available ? `Ollama connected; ${modelId} is available.` : `Ollama connected, but ${modelId} is not installed.`,
      models,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function sendJson(res: import("node:http").ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}

async function buildKingsServer(): Promise<Server> {
  const registry = new WorkforceRegistry();
  const workUnits = new WorkUnitRegistry();
  const taskControl = new TaskControl(registry);
  const machine = new KingsCodingMachine(undefined, undefined, taskControl, workUnits);
  const missionFactory = createDefaultProjectOwnerMissionFactory(registry, workUnits);
  const executionContext: ProjectOwnerExecutionContext = {
    getTask(taskId) { return registry.getTask(taskId); },
    getWorkUnit(taskId) { return workUnits.require(taskId); },
  };
  const controller = new ProjectOwnerMachineServerController(
    machine,
    missionFactory,
    executionContext,
    { modelId, workspaceRoot, ollamaBaseUrl },
  );
  const html = await readFile(join(root, "ui/project-owner/index.html"), "utf8");
  const certificate = await tls(kingsHost);

  return createServer(certificate, async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
        return;
      }
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, {
          ok: true,
          name: "kings.local",
          product: "K.I.N.G.S.",
          model: modelId,
          workspace: workspaceRoot,
          runtimeBuild: "kings-ai-https-v1",
          ollama: await ollamaHealth(),
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/project-owner/missions") {
        const request = (await parseBody(req)) as Parameters<ReturnType<typeof createDefaultProjectOwnerMissionFactory>["handle"]>[0];
        const result = await controller.handle(request);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }
      sendJson(res, 404, { ok: false, message: "Not Found" });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function buildForgeServer(): Promise<Server> {
  const forgeApi = new AuthorsForgeApi();
  const html = await readFile(join(root, "ui/project-owner/authors-forge.html"), "utf8");
  const certificate = await tls(forgeHost);

  return createServer(certificate, async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
        return;
      }
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, {
          ok: true,
          product: "AI Author's Forge",
          runtimeBuild: "authors-forge-https-v1",
          workspace: workspaceRoot,
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/authors-forge") {
        const request = (await parseBody(req)) as AuthorsForgeRequest;
        const result = forgeApi.handle(request);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }
      sendJson(res, 404, { ok: false, message: "Not Found" });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function listen(server: Server, port: number, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  console.log(`${label}: https://127.0.0.1:${port}`);
}

async function main(): Promise<void> {
  const [kings, forge] = await Promise.all([buildKingsServer(), buildForgeServer()]);
  await Promise.all([
    listen(kings, kingsPort, `K.I.N.G.S. HTTPS (${kingsHost})`),
    listen(forge, forgePort, `Author's Forge HTTPS (${forgeHost})`),
  ]);
  console.log("K.I.N.G.S. and Author's Forge are running as separate local HTTPS services.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
