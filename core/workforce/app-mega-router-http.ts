import {
  timingSafeEqual,
} from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  AppBrainGateway,
  type AppBrainMemorySelectionRequest,
  type AppBrainResearchRequest,
} from "./app-brain-gateway";
import {
  AppMegaRouterError,
  type AppMegaRouterRequest,
} from "./app-mega-router";
import {
  createAppMegaRouterRuntime,
  type AppMegaRouterRuntime,
  type AppMegaRouterRuntimeOptions,
} from "./app-mega-router-runtime";
import {
  WebAccessAdapter,
} from "./web-access";

const DEFAULT_PORT = 8790;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_RESEARCH_MAX_SOURCES = 8;
const DEFAULT_RESEARCH_MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_RESEARCH_TIMEOUT_MS = 15_000;
const RESPONSE_ROLES = new Set([
  "system",
  "user",
  "assistant",
  "tool",
]);

export interface AppMegaRouterHttpConfig {
  host: string;
  port: number;
  accessToken?: string;
  maxBodyBytes: number;
  researchMaxSources: number;
  researchMaxResponseBytes: number;
  researchTimeoutMs: number;
  researchAllowedHosts?: string[];
}

export interface AppMegaRouterHttpOptions {
  env?: NodeJS.ProcessEnv;
  config?: AppMegaRouterHttpConfig;
  runtime?: AppMegaRouterRuntime;
  runtimeOptions?: AppMegaRouterRuntimeOptions;
  webAccess?: WebAccessAdapter;
}

export interface AppMegaRouterHttpBootstrap {
  server: Server;
  runtime: AppMegaRouterRuntime;
  brain: AppBrainGateway;
  config: AppMegaRouterHttpConfig;
}

function positiveInteger(
  raw: string | undefined,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const value = Number.parseInt(
    raw ?? String(fallback),
    10,
  );
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new Error(
      `${name} must be an integer between 1 and ${maximum}.`,
    );
  }
  return value;
}

function allowedHosts(
  raw: string | undefined,
): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const hosts = [
    ...new Set(
      raw
        .split(",")
        .map((value) =>
          value
            .trim()
            .toLowerCase()
            .replace(/\.$/, ""),
        )
        .filter(Boolean),
    ),
  ];
  if (hosts.length > 128) {
    throw new Error(
      "KINGS_APP_RESEARCH_ALLOWED_HOSTS may contain at most 128 hosts.",
    );
  }
  for (const host of hosts) {
    if (
      !/^[a-z0-9.-]+$/.test(host) ||
      host.startsWith(".") ||
      host.endsWith(".") ||
      host.includes("..")
    ) {
      throw new Error(
        `KINGS_APP_RESEARCH_ALLOWED_HOSTS contains an invalid host: ${host}`,
      );
    }
  }
  return hosts;
}

export function loadAppMegaRouterHttpConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppMegaRouterHttpConfig {
  const host =
    env.KINGS_APP_ROUTER_BIND?.trim() ||
    "127.0.0.1";
  const accessToken =
    env.KINGS_APP_ROUTER_TOKEN?.trim() ||
    undefined;
  if (
    ![
      "127.0.0.1",
      "::1",
      "localhost",
    ].includes(host) &&
    !accessToken
  ) {
    throw new Error(
      "KINGS_APP_ROUTER_TOKEN is required when the app router binds beyond loopback.",
    );
  }

  return {
    host,
    port: positiveInteger(
      env.KINGS_APP_ROUTER_PORT,
      "KINGS_APP_ROUTER_PORT",
      DEFAULT_PORT,
      65_535,
    ),
    accessToken,
    maxBodyBytes: positiveInteger(
      env.KINGS_APP_ROUTER_MAX_BODY_BYTES,
      "KINGS_APP_ROUTER_MAX_BODY_BYTES",
      DEFAULT_MAX_BODY_BYTES,
      16 * 1024 * 1024,
    ),
    researchMaxSources: positiveInteger(
      env.KINGS_APP_RESEARCH_MAX_SOURCES,
      "KINGS_APP_RESEARCH_MAX_SOURCES",
      DEFAULT_RESEARCH_MAX_SOURCES,
      50,
    ),
    researchMaxResponseBytes: positiveInteger(
      env.KINGS_APP_RESEARCH_MAX_RESPONSE_BYTES,
      "KINGS_APP_RESEARCH_MAX_RESPONSE_BYTES",
      DEFAULT_RESEARCH_MAX_RESPONSE_BYTES,
      8 * 1024 * 1024,
    ),
    researchTimeoutMs: positiveInteger(
      env.KINGS_APP_RESEARCH_TIMEOUT_MS,
      "KINGS_APP_RESEARCH_TIMEOUT_MS",
      DEFAULT_RESEARCH_TIMEOUT_MS,
      120_000,
    ),
    researchAllowedHosts:
      allowedHosts(
        env.KINGS_APP_RESEARCH_ALLOWED_HOSTS,
      ),
  };
}

function safeEqual(
  left: string,
  right: string,
): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(
      leftBuffer,
      rightBuffer,
    )
  );
}

function authorized(
  request: IncomingMessage,
  accessToken?: string,
): boolean {
  if (!accessToken) return true;
  const authorization =
    request.headers.authorization;
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return false;
  }
  return safeEqual(
    authorization.slice(
      "Bearer ".length,
    ),
    accessToken,
  );
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(
    statusCode,
    {
      "content-type":
        "application/json; charset=utf-8",
      "content-length":
        Buffer.byteLength(payload),
      "cache-control":
        "no-store",
      "x-content-type-options":
        "nosniff",
      "x-frame-options":
        "DENY",
      "referrer-policy":
        "no-referrer",
    },
  );
  response.end(payload);
}

async function readJson(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const contentType = String(
    request.headers[
      "content-type"
    ] ?? "",
  ).toLowerCase();
  if (
    !contentType.startsWith(
      "application/json",
    )
  ) {
    throw new AppMegaRouterError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
      415,
    );
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer =
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new AppMegaRouterError(
        "PAYLOAD_TOO_LARGE",
        `Request body exceeds ${maxBodyBytes} bytes.`,
        413,
      );
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(
      Buffer.concat(chunks)
        .toString("utf8") ||
        "{}",
    ) as unknown;
  } catch {
    throw new AppMegaRouterError(
      "INVALID_JSON",
      "Request body must contain valid JSON.",
    );
  }
}

function objectBody(
  body: unknown,
): Record<string, unknown> {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new AppMegaRouterError(
      "INVALID_REQUEST",
      "Request body must be a JSON object.",
    );
  }
  return body as Record<string, unknown>;
}

function parseResponsesInput(
  input: unknown,
): AppMegaRouterRequest["messages"] {
  if (
    typeof input === "string" &&
    input.trim()
  ) {
    return [
      {
        role: "user",
        content: input,
      },
    ];
  }
  if (
    !Array.isArray(input) ||
    input.length < 1 ||
    input.length > 100
  ) {
    throw new AppMegaRouterError(
      "INVALID_RESPONSES_INPUT",
      "input must be a non-empty string or an array of 1 to 100 role/content messages.",
    );
  }

  return input.map(
    (entry, index) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry)
      ) {
        throw new AppMegaRouterError(
          "INVALID_RESPONSES_INPUT",
          `input[${index}] must be an object.`,
        );
      }
      const record =
        entry as Record<
          string,
          unknown
        >;
      if (
        typeof record.role !== "string" ||
        !RESPONSE_ROLES.has(
          record.role,
        )
      ) {
        throw new AppMegaRouterError(
          "INVALID_RESPONSES_ROLE",
          `input[${index}].role is not supported.`,
        );
      }
      if (
        typeof record.content !== "string" ||
        record.content.length < 1 ||
        record.content.length > 100_000
      ) {
        throw new AppMegaRouterError(
          "INVALID_RESPONSES_CONTENT",
          `input[${index}].content must contain 1 to 100000 characters.`,
        );
      }
      return {
        role: record.role as
          "system" |
          "user" |
          "assistant" |
          "tool",
        content: record.content,
      };
    },
  );
}

function parseResponsesRequest(
  body: unknown,
): AppMegaRouterRequest {
  const record = objectBody(body);
  if (
    typeof record.model !== "string" ||
    !record.model.trim()
  ) {
    throw new AppMegaRouterError(
      "INVALID_RESPONSES_MODEL",
      "model must be a non-empty string.",
    );
  }
  const maxOutputTokens =
    record.max_output_tokens;
  if (
    maxOutputTokens !== undefined &&
    (
      !Number.isInteger(maxOutputTokens) ||
      Number(maxOutputTokens) < 1 ||
      Number(maxOutputTokens) > 65_536
    )
  ) {
    throw new AppMegaRouterError(
      "INVALID_MAX_OUTPUT_TOKENS",
      "max_output_tokens must be an integer between 1 and 65536.",
    );
  }
  const temperature = record.temperature;
  if (
    temperature !== undefined &&
    (
      typeof temperature !== "number" ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2
    )
  ) {
    throw new AppMegaRouterError(
      "INVALID_TEMPERATURE",
      "temperature must be between 0 and 2.",
    );
  }

  const model = record.model.trim();
  return {
    appId: "authors.forge",
    messages:
      parseResponsesInput(
        record.input,
      ),
    requiredCapabilities: [
      "reasoning",
    ],
    costPreference: "economy",
    ...(model.toLowerCase() === "auto"
      ? {}
      : {
          preferredModelId: model,
        }),
    ...(maxOutputTokens === undefined
      ? {}
      : {
          maxOutputTokens:
            Number(maxOutputTokens),
        }),
    ...(temperature === undefined
      ? {}
      : {
          temperature,
        }),
    allowToolProposals: false,
  };
}

function createResearchAccess(
  config: AppMegaRouterHttpConfig,
): WebAccessAdapter {
  return new WebAccessAdapter({
    allowedHosts:
      config.researchAllowedHosts,
    allowedMethods: [
      "GET",
    ],
    allowedSchemes: [
      "https",
    ],
    maxResponseBytes:
      config.researchMaxResponseBytes,
    timeoutMs:
      config.researchTimeoutMs,
    maxRedirects: 0,
    blockPrivateNetworks: true,
  });
}

function statusForRouteFailure(
  code: string,
): number {
  return code === "NO_ROUTABLE_MODEL"
    ? 503
    : 502;
}

function audit(
  event: string,
  values: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      timestamp:
        new Date().toISOString(),
      event,
      ...values,
    }),
  );
}

export function createAppMegaRouterHttpServer(
  runtime: AppMegaRouterRuntime,
  brain: AppBrainGateway,
  config: AppMegaRouterHttpConfig,
): Server {
  return createServer(
    async (
      request,
      response,
    ) => {
      const startedAt = Date.now();
      const url = new URL(
        request.url ?? "/",
        `http://${
          request.headers.host ??
          "localhost"
        }`,
      );

      try {
        if (
          request.method === "GET" &&
          url.pathname === "/health"
        ) {
          return sendJson(
            response,
            200,
            {
              ok: true,
              service:
                "kings-mega-brain-router",
              routingMode:
                "capability-economics-adaptive-resilient",
              providers:
                runtime.providers
                  .listAvailable()
                  .map(
                    (provider) =>
                      provider.id,
                  ),
              models:
                runtime.capabilities
                  .list()
                  .length,
              learnedRoutes:
                runtime.metrics.size,
            },
          );
        }

        if (
          !authorized(
            request,
            config.accessToken,
          )
        ) {
          return sendJson(
            response,
            401,
            {
              ok: false,
              error: "unauthorized",
            },
          );
        }

        if (
          request.method === "GET" &&
          url.pathname === "/v1/models"
        ) {
          return sendJson(
            response,
            200,
            {
              ok: true,
              models:
                runtime.capabilities
                  .list()
                  .map(
                    (registration) => ({
                      model:
                        registration.model,
                      capabilities:
                        registration.capabilities,
                    }),
                  ),
            },
          );
        }

        if (
          request.method === "POST" &&
          url.pathname ===
            "/v1/brain/memory/select"
        ) {
          const result =
            brain.selectMemory(
              objectBody(
                await readJson(
                  request,
                  config.maxBodyBytes,
                ),
              ) as unknown as AppBrainMemorySelectionRequest,
            );
          audit(
            "app_brain_memory_select",
            {
              appId: result.appId,
              requestId:
                result.requestId,
              taskId: result.taskId,
              inspectedCount:
                result.inspectedCount,
              selectedCount:
                result.selected.length,
              durationMs:
                Date.now() - startedAt,
            },
          );
          return sendJson(
            response,
            200,
            result,
          );
        }

        if (
          request.method === "POST" &&
          url.pathname ===
            "/v1/brain/research/retrieve"
        ) {
          const result =
            await brain.retrieveResearch(
              objectBody(
                await readJson(
                  request,
                  config.maxBodyBytes,
                ),
              ) as unknown as AppBrainResearchRequest,
            );
          audit(
            "app_brain_research_retrieve",
            {
              appId: result.appId,
              requestId:
                result.requestId,
              taskId: result.taskId,
              sourceCount:
                result.sources.length,
              durationMs:
                Date.now() - startedAt,
            },
          );
          return sendJson(
            response,
            200,
            result,
          );
        }

        if (
          request.method === "POST" &&
          (
            url.pathname ===
              "/responses" ||
            url.pathname ===
              "/v1/responses"
          )
        ) {
          const result =
            await runtime.router.route(
              parseResponsesRequest(
                await readJson(
                  request,
                  config.maxBodyBytes,
                ),
              ),
            );
          audit(
            "app_ai_responses",
            {
              appId: result.appId,
              requestId:
                result.requestId,
              success: result.success,
              providerId:
                result.success
                  ? result.providerId
                  : undefined,
              modelId:
                result.success
                  ? result.modelId
                  : undefined,
              attempts:
                result.attempts.length,
              durationMs:
                Date.now() - startedAt,
            },
          );
          if (!result.success) {
            return sendJson(
              response,
              statusForRouteFailure(
                result.code,
              ),
              {
                error: {
                  code: result.code,
                  message:
                    result.message,
                },
                request_id:
                  result.requestId,
              },
            );
          }
          return sendJson(
            response,
            200,
            {
              id: result.requestId,
              object: "response",
              status: "completed",
              model: result.modelId,
              provider:
                result.providerId,
              output_text:
                result.content,
              output: [
                {
                  type: "message",
                  role: "assistant",
                  content: [
                    {
                      type: "output_text",
                      text: result.content,
                    },
                  ],
                },
              ],
              usage: {
                input_tokens:
                  result.usage.inputTokens,
                output_tokens:
                  result.usage.outputTokens,
                total_tokens:
                  result.usage.totalTokens,
              },
              routing: {
                reason:
                  result.routeReason,
                attempts:
                  result.attempts,
              },
            },
          );
        }

        if (
          request.method === "POST" &&
          url.pathname === "/v1/route"
        ) {
          const result =
            await runtime.router.route(
              objectBody(
                await readJson(
                  request,
                  config.maxBodyBytes,
                ),
              ) as unknown as AppMegaRouterRequest,
            );
          audit(
            "app_mega_route",
            {
              appId: result.appId,
              requestId:
                result.requestId,
              success: result.success,
              providerId:
                result.success
                  ? result.providerId
                  : undefined,
              modelId:
                result.success
                  ? result.modelId
                  : undefined,
              candidateCount:
                result.candidates.length,
              attempts:
                result.attempts.length,
              durationMs:
                Date.now() - startedAt,
            },
          );
          return sendJson(
            response,
            result.success
              ? 200
              : statusForRouteFailure(
                  result.code,
                ),
            result,
          );
        }

        return sendJson(
          response,
          404,
          {
            ok: false,
            error: "not_found",
          },
        );
      } catch (error) {
        if (
          error instanceof
            AppMegaRouterError
        ) {
          return sendJson(
            response,
            error.statusCode,
            {
              ok: false,
              error: error.code,
              message:
                error.message,
            },
          );
        }
        audit(
          "app_mega_router_error",
          {
            message:
              error instanceof Error
                ? error.message
                : String(error),
          },
        );
        return sendJson(
          response,
          500,
          {
            ok: false,
            error: "internal_error",
          },
        );
      }
    },
  );
}

export async function bootstrapAppMegaRouterHttp(
  options: AppMegaRouterHttpOptions = {},
): Promise<AppMegaRouterHttpBootstrap> {
  const env = options.env ?? process.env;
  const config =
    options.config ??
    loadAppMegaRouterHttpConfig(env);
  const runtime =
    options.runtime ??
    await createAppMegaRouterRuntime({
      env,
      ...options.runtimeOptions,
    });
  const brain =
    new AppBrainGateway(
      options.webAccess ??
        createResearchAccess(config),
      config.researchMaxSources,
    );
  const server =
    createAppMegaRouterHttpServer(
      runtime,
      brain,
      config,
    );
  server.requestTimeout = 70_000;
  server.headersTimeout = 10_000;
  return {
    server,
    runtime,
    brain,
    config,
  };
}
