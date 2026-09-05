import { timingSafeEqual } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

import { AppAiRouter, AppAiRouterError, type AppAiRouteRequest } from "../../core/workforce/app-ai-router";
import { createConfiguredGatewayAdapters } from "../../core/workforce/openai-compatible-gateway";
import { ProviderAdapterRegistry } from "../../core/workforce/provider-adapters";

const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_PORT = 8790;

interface RouterRuntimeConfig {
  host: string;
  port: number;
  accessToken?: string;
  providerOrder: string[];
}

function parsePort(raw: string | undefined): number {
  const value = Number.parseInt(raw ?? String(DEFAULT_PORT), 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("KINGS_APP_ROUTER_PORT must be an integer between 1 and 65535");
  }
  return value;
}

function loadConfig(env: NodeJS.ProcessEnv = process.env): RouterRuntimeConfig {
  const host = env.KINGS_APP_ROUTER_BIND?.trim() || "127.0.0.1";
  const accessToken = env.KINGS_APP_ROUTER_TOKEN?.trim() || undefined;
  if (!["127.0.0.1", "::1", "localhost"].includes(host) && !accessToken) {
    throw new Error("KINGS_APP_ROUTER_TOKEN is required when the app router binds beyond loopback");
  }
  const providerOrder = (env.KINGS_APP_ROUTER_PROVIDER_ORDER ?? "omniroute,9router")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (providerOrder.length === 0) throw new Error("KINGS_APP_ROUTER_PROVIDER_ORDER must contain at least one provider");
  return { host, port: parsePort(env.KINGS_APP_ROUTER_PORT), accessToken, providerOrder };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authorized(request: IncomingMessage, accessToken?: string): boolean {
  if (!accessToken) return true;
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice("Bearer ".length), accessToken);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = String(request.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new AppAiRouterError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", 415);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new AppAiRouterError("PAYLOAD_TOO_LARGE", "Request body exceeds 1 MiB.", 413);
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new AppAiRouterError("INVALID_JSON", "Request body must contain valid JSON.");
  }
}

export function createAppRouterRuntime(
  config = loadConfig(),
  providers = new ProviderAdapterRegistry(),
): http.Server {
  if (providers.list().length === 0) {
    for (const provider of createConfiguredGatewayAdapters()) providers.register(provider);
  }
  const router = new AppAiRouter(providers, config.providerOrder);

  return http.createServer(async (request, response) => {
    const startedAt = Date.now();
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, {
          ok: true,
          service: "kings-ai-app-router",
          providers: providers.listAvailable().map((provider) => provider.id),
        });
      }

      if (!authorized(request, config.accessToken)) {
        return sendJson(response, 401, { ok: false, error: "unauthorized" });
      }

      if (request.method === "GET" && url.pathname === "/v1/models") {
        const models = providers.listAvailable().flatMap((provider) => {
          const adapter = providers.get(provider.id);
          return adapter?.listModels() ?? [];
        });
        return sendJson(response, 200, { ok: true, models });
      }

      if (request.method === "POST" && url.pathname === "/v1/route") {
        const body = await readJson(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new AppAiRouterError("INVALID_REQUEST", "Request body must be a JSON object.");
        }
        const result = await router.route(body as AppAiRouteRequest);
        const statusCode = result.success ? 200 : result.code === "NO_ROUTABLE_MODEL" ? 503 : 502;
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "app_ai_route",
          appId: result.appId,
          requestId: result.requestId,
          success: result.success,
          providerId: result.success ? result.providerId : undefined,
          modelId: result.success ? result.modelId : undefined,
          attempts: result.attempts.length,
          durationMs: Date.now() - startedAt,
        }));
        return sendJson(response, statusCode, result);
      }

      return sendJson(response, 404, { ok: false, error: "not_found" });
    } catch (error) {
      if (error instanceof AppAiRouterError) {
        return sendJson(response, error.statusCode, { ok: false, error: error.code, message: error.message });
      }
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "app_ai_router_error",
        message: error instanceof Error ? error.message : String(error),
      }));
      return sendJson(response, 500, { ok: false, error: "internal_error" });
    }
  });
}

if (require.main === module) {
  const config = loadConfig();
  const server = createAppRouterRuntime(config);
  server.requestTimeout = 70_000;
  server.headersTimeout = 10_000;
  server.listen(config.port, config.host, () => {
    console.log(`K.I.N.G.S. App AI Router: http://${config.host}:${config.port}`);
  });
}
