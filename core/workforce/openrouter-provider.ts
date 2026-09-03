import type { ModelIdentity } from "./model-interface";
import {
  OpenAICompatibleProviderAdapter,
  type OpenAICompatibleHttpTransport,
} from "./openai-compatible-provider-adapter";

export interface OpenRouterProviderOptions {
  models: readonly ModelIdentity[];
  apiKey?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  appUrl?: string;
  appName?: string;
  requestTimeoutMs?: number;
  transport?: OpenAICompatibleHttpTransport;
}

export function createOpenRouterProviderAdapter(
  options: OpenRouterProviderOptions,
): OpenAICompatibleProviderAdapter {
  const environment = options.environment ?? process.env;
  const apiKey = options.apiKey ?? environment.OPENROUTER_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "K.I.N.G.S. OpenRouter Provider: OPENROUTER_API_KEY is required; credentials must be supplied through environment/configuration and never committed to source.",
    );
  }

  for (const model of options.models) {
    if (model.providerId !== "openrouter") {
      throw new Error(
        `K.I.N.G.S. OpenRouter Provider: model "${model.modelId}" must use providerId "openrouter"`,
      );
    }
  }

  const headers: Record<string, string> = {};
  if (options.appUrl) headers["HTTP-Referer"] = options.appUrl;
  if (options.appName) headers["X-Title"] = options.appName;

  return new OpenAICompatibleProviderAdapter(
    {
      providerId: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey,
      available: true,
      requestTimeoutMs: options.requestTimeoutMs,
      headers,
      descriptorKind: "external-paid",
      models: options.models,
    },
    options.transport,
  );
}
