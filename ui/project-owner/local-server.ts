import { createServer } from "node:http";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

import { TaskControl } from "../../core/workforce/task-control";
import { WorkforceRegistry } from "../../core/workforce/registry";
import { WorkUnitRegistry } from "../../core/workforce/work-unit-registry";
import { KingsCodingMachine } from "../../core/workforce/kings-coding-machine";
import { DurableMissionContinuityStore } from "../../core/workforce/durable-mission-continuity-store";
import type { ProjectOwnerExecutionContext } from "../../core/workforce/project-owner-machine-api";
import type { SandboxBubblewrapIsolation } from "../../core/workforce/execution-sandbox";
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
import {
  assessOwnerRuntimeReadiness,
  hasRoutableGatewayCodingModel,
  selectAutomaticCodingRoute,
} from "../../core/workforce/owner-runtime-readiness";
import {
  setDefaultProviderExecutionObserver,
} from "../../core/workforce/provider-adapters";
import {
  DurableGatewayUsageLedger,
} from "../../core/workforce/gateway-usage-ledger";

const port = Number(process.env.KINGS_CODING_MACHINE_PORT ?? 8787);
const bindHost = process.env.KINGS_CODING_MACHINE_BIND ?? "0.0.0.0";
const publicHost = process.env.KINGS_CODING_MACHINE_HOST ?? "localhost";
const stateRoot = process.env.KINGS_STATE_ROOT ?? join(process.cwd(), ".kings");
const workspaceRoot =
  process.env.KINGS_CODING_MACHINE_WORKSPACE ?? join(stateRoot, "projects");
const continuityFile =
  process.env.KINGS_CODING_MACHINE_STATE ?? join(stateRoot, "mission-continuity.json");
const usageFile =
  process.env.KINGS_GATEWAY_USAGE_FILE ?? join(stateRoot, "gateway-usage.jsonl");
const enableOllamaFallback = process.env.KINGS_ENABLE_OLLAMA_FALLBACK === "1";
const ollamaBaseUrl =
  process.env.KINGS_CODING_MACHINE_OLLAMA_URL ?? "http://127.0.0.1:11434";
const modelId = process.env.KINGS_CODING_MACHINE_MODEL ?? "qwen2.5-coder:1.5b";
const allowBuildNetwork = process.env.KINGS_BUILD_NETWORK !== "0";
const publicFile = join(process.cwd(), "ui/project-owner/index.html");
const forgeFile = join(process.cwd(), "ui/project-owner/authors-forge.html");
const manifestFile = join(process.cwd(), "ui/project-owner/manifest.webmanifest");
const serviceWorkerFile = join(process.cwd(), "ui/project-owner/service-worker.js");
const runtimeBuild = "kings-gateway-first-v7";

async function body(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function identifiesAsBubblewrap(path: string): boolean {
  const result = spawnSync(path, ["--version"], {
    encoding: "utf8",
    shell: false,
    env: process.env,
    timeout: 5_000,
  });
  if (result.status !== 0) return false;
  return /\bbubblewrap\b/i.test(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
}

async function detectProcessIsolation(): Promise<SandboxBubblewrapIsolation | undefined> {
  if (process.env.KINGS_DISABLE_HOST_ISOLATION === "1") return undefined;

  const configured = process.env.KINGS_BWRAP_PATH?.trim();
  const candidates = configured
    ? [configured]
    : ["/usr/bin/bwrap", "/bin/bwrap"];

  let executable: string | undefined;
  for (const candidate of candidates) {
    if (await isExecutable(candidate) && identifiesAsBubblewrap(candidate)) {
      executable = candidate;
      break;
    }
  }
  if (!executable) return undefined;

  const home = process.env.HOME?.trim();
  const nodePrefix = dirname(dirname(process.execPath));
  return {
    kind: "bubblewrap",
    executable,
    additionalReadOnlyPaths: [
      nodePrefix,
      ...(home ? [join(home, ".cargo", "bin"), join(home, ".rustup")] : []),
    ],
  };
}

interface OllamaHealth {
  enabled: boolean;
  ok: boolean;
  connected: boolean;
  message: string;
  models?: string[];
}

async function checkOllama(): Promise<OllamaHealth> {
  if (!enableOllamaFallback) {
    return {
      enabled: false,
      ok: false,
      connected: false,
      message:
        "Local Ollama fallback is disabled. Set KINGS_ENABLE_OLLAMA_FALLBACK=1 only if an offline fallback is wanted.",
    };
  }

  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return {
        enabled: true,
        ok: false,
        connected: false,
        message: `Ollama fallback HTTP ${response.status}`,
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
      enabled: true,
      ok: modelAvailable,
      connected: true,
      message: modelAvailable
        ? `Optional Ollama fallback connected; ${modelId} is available.`
        : `Optional Ollama fallback connected, but ${modelId} is not installed.`,
      models,
    };
  } catch (error) {
    return {
      enabled: true,
      ok: false,
      connected: false,
      message: error instanceof Error
        ? `Optional Ollama fallback unavailable: ${error.message}`
        : `Optional Ollama fallback unavailable: ${String(error)}`,
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

async function main(): Promise<void> {
  const usageLedger = new DurableGatewayUsageLedger(usageFile);
  const [initialGatewayRuntime, initialOllama, processIsolation] = await Promise.all([
    loadKingsAiGatewayRuntime(),
    checkOllama(),
    detectProcessIsolation(),
  ]);
  let gatewayRuntime = initialGatewayRuntime;
  const gatewayProviderIds = new Set(
    gatewayRuntime.gateways.map(({ adapter }) => adapter.descriptor.id),
  );

  setDefaultProviderExecutionObserver(async (
    providerId,
    modelIdValue,
    _request,
    result,
  ) => {
    if (!gatewayProviderIds.has(providerId) || !result.success || !result.response) {
      return;
    }
    const response = result.response;
    await usageLedger.record({
      requestId: response.requestId,
      providerRequestId: response.metadata.providerRequestId,
      providerId,
      modelId: modelIdValue,
      startedAt: response.metadata.startedAt,
      completedAt: response.metadata.completedAt,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.tokensUsed,
      costStatus: "unknown",
      source: "provider-response",
    });
  });

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
      localModelAvailable: enableOllamaFallback && initialOllama.ok,
      processIsolation,
    },
  );
  const forgeApi = new AuthorsForgeApi();
  let gatewayRefreshPromise: Promise<KingsAiGatewayRuntime> | undefined;

  async function refreshGateways(): Promise<KingsAiGatewayRuntime> {
    if (gatewayRefreshPromise) return gatewayRefreshPromise;
    gatewayRefreshPromise = refreshKingsAiGatewayRuntime(gatewayRuntime)
      .then((refreshed) => {
        gatewayRuntime = refreshed;
        gatewayProviderIds.clear();
        for (const { adapter } of refreshed.gateways) {
          gatewayProviderIds.add(adapter.descriptor.id);
        }
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
    controller.setLocalModelAvailability(enableOllamaFallback && ollama.ok);
    return { ollama, gateways };
  }

  function readinessFor(runtime: {
    ollama: OllamaHealth;
    gateways: KingsAiGatewayRuntime;
  }) {
    return assessOwnerRuntimeReadiness({
      localModelRoutable: enableOllamaFallback && runtime.ollama.ok,
      gatewayCodingRouteRoutable: hasRoutableGatewayCodingModel(runtime.gateways),
      repositoryExecutionAllowed: Boolean(processIsolation),
    });
  }

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        const refreshed = await refreshAiRuntime();
        const readiness = readinessFor(refreshed);
        json(res, 200, {
          ok: readiness.ready,
          alive: true,
          ready: readiness.ready,
          readiness,
          name: "kings.local",
          product: "K.I.N.G.S. AI Coding Machine",
          runtimeBuild,
          routingMode: "gateway-first",
          projectsRoot: workspaceRoot,
          continuityFile,
          usageFile,
          allowBuildNetwork,
          processIsolation: processIsolation
            ? {
                active: true,
                kind: processIsolation.kind,
                executable: processIsolation.executable,
                repositoryExecutionAllowed: true,
              }
            : {
                active: false,
                kind: null,
                executable: null,
                repositoryExecutionAllowed: false,
                message:
                  "Verified Bubblewrap was not found. GitHub repository build/test execution is fail-closed until host isolation is installed or configured.",
              },
          ollamaFallback: refreshed.ollama,
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
          automaticRoute: selectAutomaticCodingRoute(refreshed.gateways),
        });
        return;
      }

      if (req.method === "GET" && req.url === "/ready") {
        const refreshed = await refreshAiRuntime();
        const readiness = readinessFor(refreshed);
        json(res, readiness.ready ? 200 : 503, {
          ok: readiness.ready,
          ready: readiness.ready,
          runtimeBuild,
          routingMode: "gateway-first",
          readiness,
          automaticRoute: selectAutomaticCodingRoute(refreshed.gateways),
        });
        return;
      }

      if (req.method === "GET" && req.url === "/api/models") {
        const refreshed = await refreshAiRuntime();
        const automaticRoute = selectAutomaticCodingRoute(refreshed.gateways);
        const localModels = enableOllamaFallback && refreshed.ollama.ok
          ? [{
              providerId: "internal-intelligence",
              providerName: "Local Ollama (optional fallback)",
              gatewayKind: "ollama",
              modelId,
              displayName: `Local fallback: ${modelId}`,
              codingEligible: true,
              verifiedCodingRoute: true,
              local: true,
              fallbackOnly: true,
            }]
          : [];

        json(res, 200, {
          ok: true,
          routingMode: "gateway-first",
          codingReady: Boolean(automaticRoute),
          defaultModel: automaticRoute,
          automaticRoute,
          models: [
            ...refreshed.gateways.catalog.map((entry) => ({
              ...entry,
              local: false,
              costStatus: "unknown-unless-provider-reported",
            })),
            ...localModels,
          ],
          localFallback: refreshed.ollama,
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

      if (req.method === "GET" && req.url === "/api/usage") {
        const summary = await usageLedger.summarize();
        json(res, 200, {
          ok: true,
          source: "provider-reported-token-usage",
          note:
            "Costs and saved-token counts are only reported when K.I.N.G.S. has provider evidence; unknown values are never estimated as free or saved.",
          summary,
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
        const incoming = (await body(req)) as Parameters<ProjectOwnerMachineApi["handle"]>[0];
        const route =
          incoming.action === "execute-next" &&
          !incoming.preferredProviderId &&
          !incoming.preferredModelId
            ? selectAutomaticCodingRoute(gatewayRuntime)
            : null;
        const request = route
          ? {
              ...incoming,
              preferredProviderId: route.providerId,
              preferredModelId: route.modelId,
            }
          : incoming;
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

  const initialReadiness = assessOwnerRuntimeReadiness({
    localModelRoutable: enableOllamaFallback && initialOllama.ok,
    gatewayCodingRouteRoutable: hasRoutableGatewayCodingModel(gatewayRuntime),
    repositoryExecutionAllowed: Boolean(processIsolation),
  });

  server.listen(port, bindHost, () => {
    console.log(`KINGS CODING MACHINE UI: http://${publicHost}:${port}`);
    console.log(`Author's Forge: http://${publicHost}:${port}/authors-forge`);
    console.log(`Health: http://${publicHost}:${port}/health`);
    console.log(`Readiness: http://${publicHost}:${port}/ready`);
    console.log(`Models: http://${publicHost}:${port}/api/models`);
    console.log(`Usage: http://${publicHost}:${port}/api/usage`);
    console.log(`Bind: ${bindHost}:${port}`);
    console.log(`Projects: ${workspaceRoot}`);
    console.log(`Mission state: ${continuityFile}`);
    console.log(`Gateway usage ledger: ${usageFile}`);
    console.log("Routing mode: GATEWAY FIRST");
    console.log(`Optional Ollama fallback enabled: ${enableOllamaFallback}`);
    console.log(`Optional local fallback routable: ${initialOllama.ok}`);
    console.log(`AI gateways: ${gatewayRuntime.gateways.length}`);
    console.log(`Gateway model catalog: ${gatewayRuntime.catalog.length}`);
    console.log(`Automatic coding route: ${selectAutomaticCodingRoute(gatewayRuntime)?.label ?? "UNAVAILABLE"}`);
    console.log(`Host process isolation: ${processIsolation ? `${processIsolation.kind} (${processIsolation.executable})` : "UNAVAILABLE — GitHub execution blocked"}`);
    console.log(`Production ready: ${initialReadiness.ready}`);
    if (!initialReadiness.ready) {
      for (const blocker of initialReadiness.blockers) {
        console.warn(`READINESS BLOCKER: ${blocker}`);
      }
    }
    console.log(`Runtime build: ${runtimeBuild}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
