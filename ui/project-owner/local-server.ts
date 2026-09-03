import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { TaskControl } from "../../core/workforce/task-control";
import { WorkforceRegistry } from "../../core/workforce/registry";
import { WorkUnitRegistry } from "../../core/workforce/work-unit-registry";
import { KingsCodingMachine } from "../../core/workforce/kings-coding-machine";
import { DurableMissionContinuityStore } from "../../core/workforce/durable-mission-continuity-store";
import type { ProjectOwnerExecutionContext } from "../../core/workforce/project-owner-machine-api";
import {
  ProjectOwnerMachineServerController,
  createDefaultProjectOwnerMissionFactory,
} from "./server-contract";
import { ProjectOwnerMachineApi } from "../../core/workforce/project-owner-machine-api";
import { AuthorsForgeApi, type AuthorsForgeRequest } from "./authors-forge-api";
import {
  loadKingsAiGatewayRuntime,
  refreshKingsAiGatewayRuntime,
  type KingsAiGatewayRuntime,
} from "../../core/workforce/ai-gateway-runtime";

const port = Number(process.env.KINGS_CODING_MACHINE_PORT ?? 8787);
const bindHost = process.env.KINGS_CODING_MACHINE_BIND ?? "0.0.0.0";
const publicHost = process.env.KINGS_CODING_MACHINE_HOST ?? "localhost";
const stateRoot = process.env.KINGS_STATE_ROOT ?? join(process.cwd(), ".kings");
const workspaceRoot =
  process.env.KINGS_CODING_MACHINE_WORKSPACE ?? join(stateRoot, "projects");
const continuityFile =
  process.env.KINGS_CODING_MACHINE_STATE ?? join(stateRoot, "mission-continuity.json");
const ollamaBaseUrl =
  process.env.KINGS_CODING_MACHINE_OLLAMA_URL ?? "http://127.0.0.1:11434";
const modelId = process.env.KINGS_CODING_MACHINE_MODEL ?? "qwen2.5-coder:1.5b";
const allowBuildNetwork = process.env.KINGS_BUILD_NETWORK !== "0";
const publicFile = join(process.cwd(), "ui/project-owner/index.html");
const forgeFile = join(process.cwd(), "ui/project-owner/authors-forge.html");
const manifestFile = join(process.cwd(), "ui/project-owner/manifest.webmanifest");
const serviceWorkerFile = join(process.cwd(), "ui/project-owner/service-worker.js");
const runtimeBuild = "kings-chief-engineer-v4";

async function body(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

interface OllamaHealth {
  ok: boolean;
  connected: boolean;
  message: string;
  models?: string[];
}

async function checkOllama(): Promise<OllamaHealth> {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return {
        ok: false,
        connected: false,
        message: `Ollama HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = (data.models ?? [])
      .map((model) => model.name)
      .filter((name): name is string => Boolean(name))
      .sort();
    const modelAvailable = models.some(
      (name) => name === modelId || name.startsWith(`${modelId}:`),
    );

    return {
      ok: modelAvailable,
      connected: true,
      message: modelAvailable
        ? `Ollama connected; ${modelId} is available.`
        : `Ollama connected, but configured model ${modelId} is not installed.`,
      models,
    };
  } catch (error) {
    return {
      ok: false,
      connected: false,
      message: error instanceof Error
        ? `Ollama unavailable: ${error.message}`
        : `Ollama unavailable: ${String(error)}`,
    };
  }
}

function json(
  res: import("node:http").ServerResponse,
  status: number,
  value: unknown,
): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}

function automaticCodingRoute(runtime: KingsAiGatewayRuntime) {
  const healthyGatewayIds = new Set(
    runtime.gateways
      .filter(({ health }) => health.ok)
      .map(({ adapter }) => adapter.descriptor.id),
  );
  return runtime.catalog.find(
    (entry) =>
      entry.providerId === "omniroute" &&
      entry.modelId === "auto/coding" &&
      entry.verifiedCodingRoute &&
      healthyGatewayIds.has(entry.providerId),
  )
    ? {
        providerId: "omniroute",
        modelId: "auto/coding",
        label: "OmniRoute Auto Coding",
      }
    : null;
}

async function main(): Promise<void> {
  const [initialGatewayRuntime, initialOllama] = await Promise.all([
    loadKingsAiGatewayRuntime(),
    checkOllama(),
  ]);
  let gatewayRuntime = initialGatewayRuntime;

  const registry = new WorkforceRegistry();
  const workUnits = new WorkUnitRegistry();
  const taskControl = new TaskControl(registry);
  const continuity = new DurableMissionContinuityStore(continuityFile);
  const machine = new KingsCodingMachine(continuity, undefined, taskControl, workUnits);
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
    {
      modelId,
      workspaceRoot,
      ollamaBaseUrl,
      gatewayRuntime,
      allowBuildNetwork,
      localModelAvailable: initialOllama.ok,
    },
  );
  const forgeApi = new AuthorsForgeApi();
  let gatewayRefreshPromise: Promise<KingsAiGatewayRuntime> | undefined;

  async function refreshGateways(): Promise<KingsAiGatewayRuntime> {
    if (gatewayRefreshPromise) return gatewayRefreshPromise;
    gatewayRefreshPromise = refreshKingsAiGatewayRuntime(gatewayRuntime)
      .then((refreshed) => {
        gatewayRuntime = refreshed;
        controller.synchronizeGatewayRuntime(refreshed);
        return refreshed;
      })
      .finally(() => {
        gatewayRefreshPromise = undefined;
      });
    return gatewayRefreshPromise;
  }

  async function refreshAiRuntime(): Promise<{
    ollama: OllamaHealth;
    gateways: KingsAiGatewayRuntime;
  }> {
    const [ollama, gateways] = await Promise.all([
      checkOllama(),
      refreshGateways(),
    ]);
    controller.setLocalModelAvailability(ollama.ok);
    return { ollama, gateways };
  }

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        const refreshed = await refreshAiRuntime();
        json(res, 200, {
          ok: true,
          name: "kings.local",
          product: "K.I.N.G.S. AI Coding Machine",
          runtimeBuild,
          localModel: modelId,
          localModelRoutable: refreshed.ollama.ok,
          projectsRoot: workspaceRoot,
          continuityFile,
          allowBuildNetwork,
          ollama: refreshed.ollama,
          gateways: refreshed.gateways.gateways.map(({ adapter, health }) => ({
            providerId: adapter.descriptor.id,
            name: adapter.descriptor.name,
            kind: adapter.gatewayKind,
            ok: health.ok,
            message: health.message,
            totalModels: health.models.length,
            codingModels: health.codingModels.length,
          })),
          discoveredGatewayModels: refreshed.gateways.catalog.length,
          automaticRoute: automaticCodingRoute(refreshed.gateways),
        });
        return;
      }

      if (req.method === "GET" && req.url === "/api/models") {
        const refreshed = await refreshAiRuntime();
        const automaticRoute = automaticCodingRoute(refreshed.gateways);
        const localModels = refreshed.ollama.ok
          ? [{
              providerId: "internal-intelligence",
              providerName: "Local Ollama",
              gatewayKind: "ollama",
              modelId,
              displayName: `Local Ollama: ${modelId}`,
              codingEligible: true,
              verifiedCodingRoute: true,
              local: true,
            }]
          : [];

        json(res, 200, {
          ok: true,
          defaultModel: refreshed.ollama.ok
            ? { providerId: "internal-intelligence", modelId }
            : automaticRoute,
          automaticRoute,
          models: [
            ...localModels,
            ...refreshed.gateways.catalog.map((entry) => ({
              ...entry,
              local: false,
            })),
          ],
          localRuntime: {
            ok: refreshed.ollama.ok,
            connected: refreshed.ollama.connected,
            configuredModel: modelId,
            message: refreshed.ollama.message,
          },
          gateways: refreshed.gateways.gateways.map(({ adapter, health }) => ({
            providerId: adapter.descriptor.id,
            name: adapter.descriptor.name,
            kind: adapter.gatewayKind,
            ok: health.ok,
            message: health.message,
            totalModels: health.models.length,
            codingModels: health.codingModels.length,
          })),
        });
        return;
      }

      if (
        req.method === "GET" &&
        (req.url === "/" || req.url === "/authors-forge")
      ) {
        const file = req.url === "/authors-forge" ? forgeFile : publicFile;
        const html = await readFile(file, "utf8");
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(html);
        return;
      }

      if (req.method === "GET" && req.url === "/manifest.webmanifest") {
        const manifest = await readFile(manifestFile, "utf8");
        res.writeHead(200, {
          "content-type": "application/manifest+json; charset=utf-8",
          "cache-control": "no-cache",
        });
        res.end(manifest);
        return;
      }

      if (req.method === "GET" && req.url === "/service-worker.js") {
        const worker = await readFile(serviceWorkerFile, "utf8");
        res.writeHead(200, {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-cache",
          "service-worker-allowed": "/",
        });
        res.end(worker);
        return;
      }

      if (req.method === "POST" && req.url === "/api/project-owner/missions") {
        const request = (await body(req)) as Parameters<ProjectOwnerMachineApi["handle"]>[0];
        const result = await controller.handle(request);
        json(res, result.ok ? 200 : 400, result);
        return;
      }

      if (req.method === "POST" && req.url === "/api/authors-forge") {
        const request = (await body(req)) as AuthorsForgeRequest;
        const result = forgeApi.handle(request);
        json(res, result.ok ? 200 : 400, result);
        return;
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    } catch (error) {
      json(res, 500, {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.listen(port, bindHost, () => {
    console.log(`KINGS CODING MACHINE UI: http://${publicHost}:${port}`);
    console.log(`Author's Forge: http://${publicHost}:${port}/authors-forge`);
    console.log(`Health: http://${publicHost}:${port}/health`);
    console.log(`Models: http://${publicHost}:${port}/api/models`);
    console.log(`Bind: ${bindHost}:${port}`);
    console.log(`Projects: ${workspaceRoot}`);
    console.log(`Mission state: ${continuityFile}`);
    console.log(`Ollama: ${ollamaBaseUrl}`);
    console.log(`Local model: ${modelId}`);
    console.log(`Local model routable: ${initialOllama.ok}`);
    console.log(`AI gateways: ${gatewayRuntime.gateways.length}`);
    console.log(`Gateway model catalog: ${gatewayRuntime.catalog.length}`);
    console.log(`Runtime build: ${runtimeBuild}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
