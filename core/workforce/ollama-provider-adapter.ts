import type { ID } from "./types";
import type {
  IntelligenceCapability,
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";
import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "./ollama-execution-client";
import { OllamaIntelligenceModel } from "./ollama-intelligence-model";
import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "./provider-adapters";

const DEFAULT_CAPABILITIES: readonly IntelligenceCapability[] = [
  "reasoning",
  "planning",
  "coding",
  "debugging",
  "research",
  "source-inspection",
  "verification",
  "recovery",
];

const CAPABILITIES = new Set<IntelligenceCapability>([
  "reasoning", "planning", "coding", "debugging", "research", "web-learning",
  "source-inspection", "tool-use", "structured-output", "vision", "audio",
  "long-context", "memory", "verification", "recovery",
]);

export interface OllamaProviderConfig {
  baseUrl: string;
  models: readonly string[];
  capabilities?: readonly IntelligenceCapability[];
  timeoutMs?: number;
}

function normalizeBaseUrl(value: string): string {
  const baseUrl = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("K.I.N.G.S. Ollama Provider: baseUrl must use http or https");
  }
  const parsed = new URL(baseUrl);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("K.I.N.G.S. Ollama Provider: baseUrl must not contain credentials, query parameters, or fragments");
  }
  return baseUrl;
}

function uniqueModels(models: readonly string[]): string[] {
  const values = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  if (values.length === 0) {
    throw new Error("K.I.N.G.S. Ollama Provider: at least one model is required");
  }
  return values;
}

function validateCapabilities(values: readonly IntelligenceCapability[]): IntelligenceCapability[] {
  const normalized = [...new Set(values)];
  if (normalized.length === 0) {
    throw new Error("K.I.N.G.S. Ollama Provider: at least one capability is required");
  }
  for (const capability of normalized) {
    if (!CAPABILITIES.has(capability)) {
      throw new Error(`K.I.N.G.S. Ollama Provider: unsupported capability "${String(capability)}"`);
    }
  }
  if (normalized.includes("tool-use") || normalized.includes("structured-output")) {
    throw new Error("K.I.N.G.S. Ollama Provider: the current local adapter does not claim tool-use or structured-output support");
  }
  return normalized;
}

class FetchOllamaTransport implements OllamaHttpTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async post(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) {
        const detail = text.trim().slice(0, 500);
        throw new Error(`Ollama HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new Error(`Ollama returned invalid JSON (HTTP ${response.status}).`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Ollama request exceeded ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class OllamaProviderAdapter implements ProviderAdapter {
  readonly descriptor: ProviderDescriptor = {
    id: "ollama-internal",
    name: "Ollama",
    kind: "internal-local",
    available: true,
  };

  private readonly models = new Map<ID, OllamaIntelligenceModel>();

  constructor(config: OllamaProviderConfig) {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const timeoutMs = config.timeoutMs ?? 60_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
      throw new Error("K.I.N.G.S. Ollama Provider: timeoutMs must be an integer from 1000 to 600000");
    }
    const capabilities = validateCapabilities(config.capabilities ?? DEFAULT_CAPABILITIES);
    const client = new HttpOllamaExecutionClient(
      new FetchOllamaTransport(baseUrl, timeoutMs),
    );

    for (const modelId of uniqueModels(config.models)) {
      this.models.set(
        modelId,
        new OllamaIntelligenceModel(client, modelId, capabilities, this.descriptor.id),
      );
    }
  }

  listModels(): readonly ModelIdentity[] {
    return [...this.models.values()]
      .map((model) => model.identity)
      .sort((left, right) => left.modelId.localeCompare(right.modelId));
  }

  getModel(modelId: ID): IntelligenceModel | undefined {
    return this.models.get(modelId);
  }

  execute(modelId: ID, request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const model = this.models.get(modelId);
    if (model) return model.execute(request);

    const now = new Date().toISOString();
    return Promise.resolve({
      success: false,
      failure: {
        requestId: request.id,
        providerId: this.descriptor.id,
        modelId,
        retryable: false,
        code: "OLLAMA_MODEL_NOT_REGISTERED",
        message: `Ollama model "${modelId}" is not registered.`,
        metadata: {
          requestId: request.id,
          startedAt: now,
          completedAt: now,
          latencyMs: 0,
        },
      },
    });
  }
}

function csv(value: string | undefined): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function configuredCapabilities(value: string | undefined): IntelligenceCapability[] | undefined {
  if (!value?.trim()) return undefined;
  return validateCapabilities(csv(value) as IntelligenceCapability[]);
}

function configuredTimeout(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 600_000) {
    throw new Error("KINGS_OLLAMA_TIMEOUT_MS must be an integer from 1000 to 600000");
  }
  return parsed;
}

export function createConfiguredOllamaAdapter(
  env: NodeJS.ProcessEnv = process.env,
): OllamaProviderAdapter | undefined {
  const baseUrl = env.KINGS_OLLAMA_BASE_URL?.trim();
  const models = csv(env.KINGS_OLLAMA_MODELS);
  if (models.length === 0 && env.KINGS_OLLAMA_MODEL?.trim()) models.push(env.KINGS_OLLAMA_MODEL.trim());

  const anyConfigured = Boolean(baseUrl || models.length > 0 || env.KINGS_OLLAMA_CAPABILITIES?.trim());
  if (!anyConfigured) return undefined;
  if (!baseUrl) {
    throw new Error("KINGS_OLLAMA_BASE_URL is required when the local Ollama provider is configured");
  }
  if (models.length === 0) {
    throw new Error("KINGS_OLLAMA_MODEL or KINGS_OLLAMA_MODELS is required when the local Ollama provider is configured");
  }

  return new OllamaProviderAdapter({
    baseUrl,
    models,
    capabilities: configuredCapabilities(env.KINGS_OLLAMA_CAPABILITIES),
    timeoutMs: configuredTimeout(env.KINGS_OLLAMA_TIMEOUT_MS),
  });
}
