import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import {
  join,
} from "node:path";
import {
  tmpdir,
} from "node:os";
import type {
  AddressInfo,
} from "node:net";

import {
  AppBrainGateway,
} from "./app-brain-gateway";
import {
  createAppMegaRouterHttpServer,
  loadAppMegaRouterHttpConfig,
  type AppMegaRouterHttpConfig,
} from "./app-mega-router-http";
import {
  createAppMegaRouterRuntime,
} from "./app-mega-router-runtime";
import {
  loadKingsAiGatewayRuntime,
} from "./ai-gateway-runtime";
import type {
  OpenAiCompatibleGatewayConfig,
  OpenAiCompatibleGatewayTransport,
} from "./openai-compatible-gateway";
import {
  WebAccessAdapter,
  type WebAccessFetcher,
  type WebAccessHostResolver,
  type WebAccessResponse,
} from "./web-access";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function gatewayTransport(): OpenAiCompatibleGatewayTransport {
  return {
    async request(
      method,
      path,
      body,
    ) {
      if (
        method === "GET" &&
        path === "/models"
      ) {
        return {
          status: 200,
          body: {
            data: [
              {
                id: "auto/coding",
                context_length: 128_000,
                supported_parameters: [
                  "response_format",
                  "tools",
                ],
                architecture: {
                  input_modalities: [
                    "text",
                  ],
                },
              },
            ],
          },
          text: "",
        };
      }
      if (
        method === "POST" &&
        path === "/chat/completions"
      ) {
        const request = body as {
          model?: string;
          messages?: unknown[];
        };
        assert(
          request.model === "auto/coding",
          "HTTP runtime must execute the synchronized gateway model.",
        );
        assert(
          Array.isArray(request.messages) &&
          request.messages.length > 0,
          "HTTP runtime must forward model messages.",
        );
        return {
          status: 200,
          body: {
            id: "provider-http-request",
            choices: [
              {
                message: {
                  content:
                    "mega brain http completion",
                },
              },
            ],
            usage: {
              prompt_tokens: 8,
              completion_tokens: 4,
              total_tokens: 12,
              cost_usd: 0.005,
            },
          },
          text: "",
        };
      }
      return {
        status: 404,
        body: {
          error: "not found",
        },
        text: "not found",
      };
    },
  };
}

class TestResolver implements WebAccessHostResolver {
  async resolve(
    hostname: string,
  ): Promise<string[]> {
    return hostname === "example.com"
      ? [
          "93.184.216.34",
        ]
      : [];
  }
}

function webResponse(
  content: string,
  url: string,
): WebAccessResponse {
  const bytes =
    new TextEncoder().encode(
      content,
    );
  let consumed = false;
  return {
    status: 200,
    statusText: "OK",
    url,
    headers: {
      get(name: string): string | null {
        const key =
          name.toLowerCase();
        if (
          key === "content-length"
        ) {
          return String(
            bytes.byteLength,
          );
        }
        if (
          key === "content-type"
        ) {
          return "text/plain; charset=utf-8";
        }
        return null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (consumed) {
              return {
                done: true,
              };
            }
            consumed = true;
            return {
              done: false,
              value: bytes,
            };
          },
          async cancel() {},
          releaseLock() {},
        };
      },
    },
  };
}

function researchAccess(): WebAccessAdapter {
  const fetcher: WebAccessFetcher =
    async (url) =>
      webResponse(
        "Verified market source evidence.",
        url,
      );
  return new WebAccessAdapter(
    {
      allowedHosts: [
        "example.com",
      ],
      allowedMethods: [
        "GET",
      ],
      allowedSchemes: [
        "https",
      ],
      maxResponseBytes: 16_384,
      timeoutMs: 5_000,
      maxRedirects: 0,
      blockPrivateNetworks: true,
    },
    new TestResolver(),
    fetcher,
  );
}

async function post(
  base: string,
  path: string,
  body: unknown,
  token?: string,
) {
  return fetch(
    `${base}${path}`,
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
        ...(token
          ? {
              authorization:
                `Bearer ${token}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

async function main(): Promise<void> {
  let offLoopbackRejected = false;
  try {
    loadAppMegaRouterHttpConfig({
      KINGS_APP_ROUTER_BIND:
        "0.0.0.0",
    });
  } catch (error) {
    offLoopbackRejected =
      error instanceof Error &&
      /TOKEN/.test(
        error.message,
      );
  }
  assert(
    offLoopbackRejected,
    "Non-loopback mega-router binding must require an access token.",
  );

  console.log(
    "001.MEGA-HTTP off-loopback authentication gate: SUCCESS",
  );

  const stateRoot =
    await mkdtemp(
      join(
        tmpdir(),
        "kings-mega-http-",
      ),
    );
  const gatewayEnv: NodeJS.ProcessEnv = {
    KINGS_OMNIROUTE_URL:
      "https://omniroute.invalid/v1",
    KINGS_OMNIROUTE_KEY:
      "acceptance-key",
    KINGS_OMNIROUTE_MODELS:
      "auto/coding",
  };
  const token =
    "mega-http-acceptance-token";
  let server:
    ReturnType<
      typeof createAppMegaRouterHttpServer
    > |
    undefined;

  try {
    const runtime =
      await createAppMegaRouterRuntime({
        env: gatewayEnv,
        stateRoot,
        loadGatewayRuntime: () =>
          loadKingsAiGatewayRuntime({
            env: gatewayEnv,
            transportFactory(
              _config: OpenAiCompatibleGatewayConfig,
            ) {
              return gatewayTransport();
            },
          }),
      });
    const config: AppMegaRouterHttpConfig = {
      host: "127.0.0.1",
      port: 0,
      accessToken: token,
      maxBodyBytes:
        1024 * 1024,
      researchMaxSources: 4,
      researchMaxResponseBytes:
        16_384,
      researchTimeoutMs: 5_000,
      researchAllowedHosts: [
        "example.com",
      ],
    };
    server =
      createAppMegaRouterHttpServer(
        runtime,
        new AppBrainGateway(
          researchAccess(),
          4,
        ),
        config,
      );

    await new Promise<void>(
      (resolve, reject) => {
        server!.once(
          "error",
          reject,
        );
        server!.listen(
          0,
          "127.0.0.1",
          () => resolve(),
        );
      },
    );
    const address =
      server.address() as AddressInfo;
    const base =
      `http://127.0.0.1:${address.port}`;

    const health =
      await fetch(
        `${base}/health`,
      );
    const healthBody =
      await health.json() as {
        ok?: boolean;
        providers?: string[];
      };
    assert(
      health.ok &&
      healthBody.ok === true &&
      healthBody.providers?.includes(
        "omniroute",
      ) === true,
      "Health must expose the live synchronized gateway fleet without requiring credentials.",
    );

    const unauthorized =
      await fetch(
        `${base}/v1/models`,
      );
    assert(
      unauthorized.status === 401,
      "Protected mega-brain APIs must reject missing bearer authentication.",
    );

    console.log(
      "002.MEGA-HTTP live health + protected API auth: SUCCESS",
    );

    const route =
      await post(
        base,
        "/v1/route",
        {
          appId:
            "authors.forge",
          requestId:
            "http-route-1",
          messages: [
            {
              role: "user",
              content:
                "Route through the hardened mega brain.",
            },
          ],
          requiredCapabilities: [
            "reasoning",
            "coding",
          ],
          allowUnverifiedUnderPostExecutionVerification:
            true,
          costPreference:
            "economy",
        },
        token,
      );
    const routeBody =
      await route.json() as {
        success?: boolean;
        providerId?: string;
        content?: string;
        attempts?: unknown[];
      };
    assert(
      route.ok &&
      routeBody.success === true &&
      routeBody.providerId ===
        "omniroute" &&
      routeBody.content ===
        "mega brain http completion" &&
      Array.isArray(
        routeBody.attempts,
      ),
      "Authenticated /v1/route must execute through the real mega-router runtime and return routing evidence.",
    );
    assert(
      route.headers.get(
        "cache-control",
      ) === "no-store" &&
      route.headers.get(
        "x-content-type-options",
      ) === "nosniff",
      "Mega-router responses must carry the hardened security headers.",
    );

    console.log(
      "003.MEGA-HTTP authenticated route execution: SUCCESS",
    );

    runtime.capabilities
      .recordProviderVerification(
        "omniroute",
        "auto/coding",
        "reasoning",
        "verified",
        95,
        [
          "mega-http-responses-acceptance",
        ],
        "2026-09-05T08:45:00.000Z",
      );
    const responses =
      await post(
        base,
        "/v1/responses",
        {
          model: "auto",
          input:
            "Respond through the compatibility boundary.",
        },
        token,
      );
    const responsesBody =
      await responses.json() as {
        status?: string;
        provider?: string;
        output_text?: string;
      };
    assert(
      responses.ok &&
      responsesBody.status ===
        "completed" &&
      responsesBody.provider ===
        "omniroute" &&
      responsesBody.output_text ===
        "mega brain http completion",
      "OpenAI-style Responses compatibility must route through the same governed mega-brain engine once capability evidence is verified.",
    );

    console.log(
      "004.MEGA-HTTP Responses compatibility: SUCCESS",
    );

    const memory =
      await post(
        base,
        "/v1/brain/memory/select",
        {
          appId:
            "authors.forge",
          requestId:
            "http-memory-1",
          taskId:
            "scene-continuity",
          missionId:
            "novel-1",
          query:
            "Find authoritative scene canon.",
          memories: [
            {
              id: "canon-1",
              type: "semantic",
              summary:
                "Author-approved scene canon.",
              sourceReferences: [
                "author-approved:scene-4",
              ],
              missionId:
                "novel-1",
              authoritative: true,
              createdAt:
                "2026-09-05T00:00:00.000Z",
              updatedAt:
                "2026-09-05T00:00:00.000Z",
            },
          ],
        },
        token,
      );
    const memoryBody =
      await memory.json() as {
        selected?: Array<{
          memory?: {
            id?: string;
          };
        }>;
      };
    assert(
      memory.ok &&
      memoryBody.selected?.[0]
        ?.memory?.id ===
        "canon-1",
      "HTTP App Brain memory selection must preserve provenance-aware ranking.",
    );

    const research =
      await post(
        base,
        "/v1/brain/research/retrieve",
        {
          appId:
            "kings.collectors",
          requestId:
            "http-research-1",
          taskId:
            "market-research",
          question:
            "What does the source establish?",
          urls: [
            "https://example.com/source",
          ],
        },
        token,
      );
    const researchBody =
      await research.json() as {
        sources?: Array<{
          content?: string;
        }>;
      };
    assert(
      research.ok &&
      researchBody.sources?.[0]
        ?.content?.includes(
          "Verified market source evidence",
        ) === true,
      "HTTP App Brain research must traverse the governed HTTPS research boundary.",
    );

    console.log(
      "005.MEGA-HTTP cross-app memory + research: SUCCESS",
    );
    console.log(
      "APP-MEGA-ROUTER HTTP V1: SUCCESS",
    );
  } finally {
    if (server) {
      await new Promise<void>(
        (resolve) =>
          server!.close(
            () => resolve(),
          ),
      ).catch(() => undefined);
    }
    await rm(
      stateRoot,
      {
        recursive: true,
        force: true,
      },
    );
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
