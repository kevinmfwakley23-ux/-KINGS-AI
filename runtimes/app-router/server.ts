import { timingSafeEqual } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

import { AppAiRouter, AppAiRouterError, type AppAiRouteRequest } from "../../core/workforce/app-ai-router";
import { createConfiguredGatewayAdapters } from "../../core/workforce/openai-compatible-gateway";
import { ProviderAdapterRegistry } from "../../core/workforce/provider-adapters";

const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_PORT = 8790;
const RESPONSES_APP_ID = "authors.forge";
const RESPONSE_ROLES = new Set(["system", "user", "assistant", "tool"]);

interface RouterRuntimeConfig {
  host: string;
  port: number;
  accessToken?: string;
  providerOrder: string[];
}

type ResponsesRole = "system" | "user" | "assistant" | "tool";

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

function parseResponsesInput(input: unknown): Array<{ role: ResponsesRole; content: string }> {
  if (typeof input === "string" && input.trim()) {
    return [{ role: "user", content: input }];
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    throw new AppAiRouterError("INVALID_RESPONSES_INPUT", "input must be a non-empty string or an array of 1 to 100 role/content messages.");
  }
  return input.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AppAiRouterError("INVALID_RESPONSES_INPUT", `input[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const role = record.role;
    const content = record.content;
    if (typeof role !== "string" || !RESPONSE_ROLES.has(role)) {
      throw new AppAiRouterError("INVALID_RESPONSES_ROLE", `input[${index}].role is not supported.`);
    }
    if (typeof content !== "string" || content.length < 1 || content.length > 100_000) {
      throw new AppAiRouterError("INVALID_RESPONSES_CONTENT", `input[${index}].content must contain 1 to 100000 characters.`);
    }
    return { role: role as ResponsesRole, content };
  });
}

function parseResponsesRequest(body: unknown): AppAiRouteRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppAiRouterError("INVALID_RESPONSES_REQUEST", "Request body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;
  const model = record.model;
  if (typeof model !== "string" || !model.trim()) {
    throw new AppAiRouterError("INVALID_RESPONSES_MODEL", "model must be a non-empty string.");
  }
  const maxOutputTokens = record.max_output_tokens;
  if (maxOutputTokens !== undefined && (!Number.isInteger(maxOutputTokens) || Number(maxOutputTokens) < 1 || Number(maxOutputTokens) > 65_536)) {
    throw new AppAiRouterError("INVALID_MAX_OUTPUT_TOKENS", "max_output_tokens must be an integer between 1 and 65536.");
  }
  const temperature = record.temperature;
  if (temperature !== undefined && (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
    throw new AppAiRouterError("INVALID_TEMPERATURE", "temperature must be between 0 and 2.");
  }
  return {
    appId: RESPONSES_APP_ID,
    messages: parseResponsesInput(record.input),
    ...(model.trim().toLowerCase() === "auto" ? {} : { modelId: model.trim() }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens: Number(maxOutputTokens) }),
    ...(temperature === undefined ? {} : { temperature }),
    requiredCapabilities: ["reasoning"],
    allowToolProposals: false,
  };
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

      if (request.method === "POST" && (url.pathname === "/responses" || url.pathname === "/v1/responses")) {
        const result = await router.route(parseResponsesRequest(await readJson(request)));
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "app_ai_responses",
          appId: result.appId,
          requestId: result.requestId,
          success: result.success,
          providerId: result.success ? result.providerId : undefined,
          modelId: result.success ? result.modelId : undefined,
          attempts: result.attempts.length,
          durationMs: Date.now() - startedAt,
        }));
        if (!result.success) {
          const statusCode = result.code === "NO_ROUTABLE_MODEL" ? 503 : 502;
          return sendJson(response, statusCode, {
            error: { code: result.code, message: result.message },
            request_id: result.requestId,
          });
        }
        return sendJson(response, 200, {
          id: result.requestId,
          object: "response",
          status: "completed",
          model: result.modelId,
          provider: result.providerId,
          output_text: result.content,
          output: [{
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: result.content }],
          }],
          usage: {
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
            total_tokens: result.usage.totalTokens,
          },
        });
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
