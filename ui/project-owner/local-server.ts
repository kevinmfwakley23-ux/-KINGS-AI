import { createServer } from "node:http";
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
import { ProjectOwnerMachineApi } from "../../core/workforce/project-owner-machine-api";
import { AuthorsForgeApi, type AuthorsForgeRequest } from "./authors-forge-api";

const port = Number(process.env.KINGS_CODING_MACHINE_PORT ?? 8787);
const bindHost = process.env.KINGS_CODING_MACHINE_BIND ?? "0.0.0.0";
const publicHost = process.env.KINGS_CODING_MACHINE_HOST ?? "localhost";
const workspaceRoot = process.env.KINGS_CODING_MACHINE_WORKSPACE ?? process.cwd();
const ollamaBaseUrl =
  process.env.KINGS_CODING_MACHINE_OLLAMA_URL ?? "http://127.0.0.1:11434";
const modelId = process.env.KINGS_CODING_MACHINE_MODEL ?? "qwen2.5-coder:1.5b";
const publicFile = join(process.cwd(), "ui/project-owner/index.html");
const forgeFile = join(process.cwd(), "ui/project-owner/authors-forge.html");
const runtimeBuild = "authors-forge-v1";

async function body(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function checkOllama(): Promise<{
  ok: boolean;
  message: string;
  models?: string[];
}> {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`);
    if (!response.ok) {
      return { ok: false, message: `Ollama HTTP ${response.status}` };
    }
    const data = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = (data.models ?? [])
      .map((model) => model.name)
      .filter((name): name is string => Boolean(name));
    const modelAvailable = models.some(
      (name) => name === modelId || name.startsWith(`${modelId}:`),
    );
    return {
      ok: modelAvailable,
      message: modelAvailable
        ? `Ollama connected; ${modelId} is available.`
        : `Ollama connected, but ${modelId} is not installed.`,
      models,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Ollama unavailable: ${error.message}`
          : `Ollama unavailable: ${String(error)}`,
    };
  }
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const workUnits = new WorkUnitRegistry();
  const taskControl = new TaskControl(registry);
  const machine = new KingsCodingMachine(undefined, undefined, taskControl, workUnits);
  const missionFactory = createDefaultProjectOwnerMissionFactory(registry, workUnits);

  const executionContext: ProjectOwnerExecutionContext = {
    getTask(taskId) {
      return registry.getTask(taskId);
    },
    getWorkUnit(taskId) {
      return workUnits.require(taskId);
    },
  };

  const controller = new ProjectOwnerMachineServerController(
    machine,
    missionFactory,
    executionContext,
    { modelId, workspaceRoot, ollamaBaseUrl },
  );
  const forgeApi = new AuthorsForgeApi();

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && (req.url === "/" || req.url === "/health" || req.url === "/authors-forge")) {
        if (req.url === "/health") {
          const ollama = await checkOllama();
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify({
            ok: true,
            name: "kings.local",
            product: "AI Author's Forge",
            model: modelId,
            workspace: workspaceRoot,
            runtimeBuild,
            ollama,
          }));
          return;
        }

        const file = req.url === "/authors-forge" ? forgeFile : publicFile;
        const html = await readFile(file, "utf8");
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(html);
        return;
      }

      if (req.method === "POST" && req.url === "/api/project-owner/missions") {
        const request = (await body(req)) as Parameters<ProjectOwnerMachineApi["handle"]>[0];
        const result = await controller.handle(request);
        res.writeHead(result.ok ? 200 : 400, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === "POST" && req.url === "/api/authors-forge") {
        const request = (await body(req)) as AuthorsForgeRequest;
        const result = forgeApi.handle(request);
        res.writeHead(result.ok ? 200 : 400, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    } catch (error) {
      res.writeHead(500, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  });

  server.listen(port, bindHost, () => {
    console.log(`KINGS CODING MACHINE UI: http://${publicHost}:${port}`);
    console.log(`Author's Forge: http://${publicHost}:${port}/authors-forge`);
    console.log(`Health: http://${publicHost}:${port}/health`);
    console.log(`Bind: ${bindHost}:${port}`);
    console.log(`Workspace: ${workspaceRoot}`);
    console.log(`Ollama: ${ollamaBaseUrl}`);
    console.log(`Model: ${modelId}`);
    console.log(`Runtime build: ${runtimeBuild}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
