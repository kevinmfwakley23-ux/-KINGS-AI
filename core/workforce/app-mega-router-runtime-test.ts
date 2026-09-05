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
  modelRoutingMetricKey,
} from "./model-routing";

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

function createTransport(): OpenAiCompatibleGatewayTransport {
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
                  "tools",
                  "response_format",
                ],
                architecture: {
                  input_modalities: [
                    "text",
                  ],
                },
              },
            ],
          },
          text: JSON.stringify({
            data: [
              {
                id: "auto/coding",
              },
            ],
          }),
        };
      }

      if (
        method === "POST" &&
        path === "/chat/completions"
      ) {
        const request = body as {
          model?: string;
        };
        assert(
          request.model === "auto/coding",
          "Runtime must execute the synchronized gateway model.",
        );
        return {
          status: 200,
          body: {
            id: "provider-request-1",
            choices: [
              {
                message: {
                  content:
                    "production-routed completion",
                },
              },
            ],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 5,
              total_tokens: 25,
              cached_tokens: 4,
              saved_tokens: 3,
              cost_usd: 0.01,
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

async function gatewayRuntime(
  env: NodeJS.ProcessEnv,
) {
  return loadKingsAiGatewayRuntime({
    env,
    transportFactory(
      _config: OpenAiCompatibleGatewayConfig,
    ) {
      return createTransport();
    },
  });
}

async function main(): Promise<void> {
  const stateRoot =
    await mkdtemp(
      join(
        tmpdir(),
        "kings-mega-router-runtime-",
      ),
    );
  const env: NodeJS.ProcessEnv = {
    KINGS_OMNIROUTE_URL:
      "https://omniroute.invalid/v1",
    KINGS_OMNIROUTE_KEY:
      "acceptance-key",
    KINGS_OMNIROUTE_MODELS:
      "auto/coding",
  };

  try {
    const runtime =
      await createAppMegaRouterRuntime({
        env,
        stateRoot,
        loadGatewayRuntime: () =>
          gatewayRuntime(env),
        resilientExecution: {
          maximumAttempts: 3,
          failureThreshold: 1,
          cooldownMs: 10_000,
        },
      });

    assert(
      runtime.providers.listAvailable()
        .some(
          (provider) =>
            provider.id ===
            "omniroute",
        ),
      "Configured OmniRoute must become a real available provider in the mega-router runtime.",
    );
    assert(
      runtime.capabilities.get(
        "omniroute",
        "auto/coding",
      ) !== undefined,
      "Live gateway models must synchronize into the capability registry.",
    );

    console.log(
      "001.MEGA-RUNTIME gateway synchronization: SUCCESS",
    );

    const result =
      await runtime.router.route({
        appId:
          "authors.forge",
        requestId:
          "runtime-route-1",
        messages: [
          {
            role:
              "user",
            content:
              "Route this through the production gateway runtime.",
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
      });

    assert(
      result.success,
      "The synchronized gateway must execute a real adapter request.",
    );
    if (!result.success) return;
    assert(
      result.providerId ===
        "omniroute" &&
      result.modelId ===
        "auto/coding" &&
      result.content ===
        "production-routed completion",
      "The child-app result must preserve the actual gateway/model/content boundary.",
    );
    assert(
      result.usage.reportedCostUsd ===
        0.01 &&
      result.usage.cachedTokens ===
        4 &&
      result.usage.savedTokens ===
        3,
      "Provider-reported economics and token savings must survive the mega-router boundary.",
    );

    console.log(
      "002.MEGA-RUNTIME real provider-adapter execution: SUCCESS",
    );

    const key =
      modelRoutingMetricKey(
        "omniroute",
        "auto/coding",
      );
    const learned =
      runtime.metrics.get(key);
    assert(
      learned !== undefined &&
      learned.costBasis ===
        "provider-reported" &&
      learned.estimatedCost ===
        0.01 &&
      learned.reliability > 80,
      "Successful execution must adapt in-memory routing economics and reliability.",
    );

    const persistedMetrics =
      await runtime.routingMetricsStore.snapshot();
    assert(
      persistedMetrics.some(
        (record) =>
          record.providerId ===
            "omniroute" &&
          record.modelId ===
            "auto/coding" &&
          record.metric.estimatedCost ===
            0.01,
      ),
      "Learned routing metrics must persist after execution.",
    );

    console.log(
      "003.MEGA-RUNTIME adaptive durable route learning: SUCCESS",
    );

    const usage =
      await runtime.usageLedger.list?.();
    assert(
      Array.isArray(usage) &&
      usage.length === 1 &&
      usage[0]?.providerId ===
        "omniroute" &&
      usage[0]?.costUsd ===
        0.01,
      "Successful gateway execution must be recorded in the durable usage ledger.",
    );

    console.log(
      "004.MEGA-RUNTIME durable usage evidence: SUCCESS",
    );

    const restarted =
      await createAppMegaRouterRuntime({
        env,
        stateRoot,
        loadGatewayRuntime: () =>
          gatewayRuntime(env),
      });
    const restored =
      restarted.metrics.get(key);
    assert(
      restored?.estimatedCost ===
        0.01 &&
      restored.costBasis ===
        "provider-reported" &&
      restored.reliability ===
        learned.reliability,
      "Restarted mega-router runtime must restore learned routing evidence instead of resetting to seed metrics.",
    );

    console.log(
      "005.MEGA-RUNTIME restart-persistent learning: SUCCESS",
    );
    console.log(
      "APP-MEGA-ROUTER RUNTIME V1: SUCCESS",
    );
  } finally {
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
