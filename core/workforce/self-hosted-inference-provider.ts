import type { IntelligenceCapability } from "./model-interface";
import { OpenAICompatibleGatewayAdapter } from "./openai-compatible-gateway";

/**
 * Connect an inference server operating on owner-held model weights.
 * llama.cpp, vLLM and similar local OpenAI-compatible runtimes are inference
 * engines, not externally hosted AI agents. No provider discovery or cloud
 * fallback is performed here.
 *
 * Endpoint ownership alone does not prove that the weights were independently
 * trained by K.I.N.G.S.; model promotion is governed separately.
 */
export const KINGS_SELF_HOSTED_PROVIDER_ID = "kings-self-hosted";

const CAPABILITIES: ReadonlySet<IntelligenceCapability> = new Set([
  "reasoning", "planning", "coding", "debugging", "research", "web-learning",
  "source-inspection", "tool-use", "structured-output", "long-context",
  "memory", "verification", "recovery",
]);

function integerLimit(value: string | undefined, label: string, fallback: number, maximum: number): number {
  const parsed = value?.trim() ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1024 || parsed > maximum) {
    throw new Error(`${label} must be an integer between 1024 and ${maximum}`);
  }
  return parsed;
}

function booleanOption(value: string | undefined, label: string): boolean {
  if (value === undefined || !value.trim()) return false;
  if (value.trim() === "true") return true;
  if (value.trim() === "false") return false;
  throw new Error(`${label} must be true or false`);
}

function configuredCapabilities(raw: string | undefined): IntelligenceCapability[] {
  if (!raw?.trim()) return ["reasoning"];
  const candidates = raw.split(",").map((value) => value.trim());
  if (candidates.some((capability) => !capability || !CAPABILITIES.has(capability as IntelligenceCapability))) {
    throw new Error("KINGS_SELF_HOSTED_CAPABILITIES contains an unsupported capability");
  }
  const capabilities = [...new Set(candidates)] as IntelligenceCapability[];
  if (capabilities.length > 16) throw new Error("Too many self-hosted capabilities");
  return capabilities;
}

/** Explicit configuration prevents an unused gateway becoming an available model. */
export function createConfiguredSelfHostedAdapter(
  env: NodeJS.ProcessEnv = process.env,
): OpenAICompatibleGatewayAdapter | undefined {
  const baseUrl = env.KINGS_SELF_HOSTED_BASE_URL?.trim();
  const modelId = env.KINGS_SELF_HOSTED_MODEL?.trim();
  if (!baseUrl && !modelId) return undefined;
  if (!baseUrl || !modelId) {
    throw new Error("KINGS_SELF_HOSTED_BASE_URL and KINGS_SELF_HOSTED_MODEL must both be configured");
  }
  const parsed = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsed.protocol) ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== "/v1" && parsed.pathname !== "/v1/") {
    throw new Error("KINGS_SELF_HOSTED_BASE_URL must be a clean HTTP(S) /v1 model endpoint");
  }
  if (modelId.toLowerCase() === "auto") {
    throw new Error("KINGS_SELF_HOSTED_MODEL must name an exact local model, not auto");
  }
  const capabilities = configuredCapabilities(env.KINGS_SELF_HOSTED_CAPABILITIES);
  const supportsToolCalling = booleanOption(
    env.KINGS_SELF_HOSTED_TOOL_CALLING, "KINGS_SELF_HOSTED_TOOL_CALLING",
  );
  const supportsStructuredOutput = booleanOption(
    env.KINGS_SELF_HOSTED_STRUCTURED_OUTPUT, "KINGS_SELF_HOSTED_STRUCTURED_OUTPUT",
  );
  if (supportsToolCalling && !capabilities.includes("tool-use")) {
    throw new Error("KINGS_SELF_HOSTED_TOOL_CALLING requires verified tool-use capability");
  }
  if (supportsStructuredOutput && !capabilities.includes("structured-output")) {
    throw new Error("KINGS_SELF_HOSTED_STRUCTURED_OUTPUT requires verified structured-output capability");
  }
  return new OpenAICompatibleGatewayAdapter({
    providerId: KINGS_SELF_HOSTED_PROVIDER_ID,
    name: "K.I.N.G.S. Owner-Hosted Inference",
    providerKind: "internal-self-hosted",
    baseUrl,
    apiKey: env.KINGS_SELF_HOSTED_API_KEY,
    models: [{
      id: modelId,
      displayName: `Owner-hosted: ${modelId}`,
      capabilities,
      contextWindowTokens: integerLimit(
        env.KINGS_SELF_HOSTED_CONTEXT_TOKENS, "KINGS_SELF_HOSTED_CONTEXT_TOKENS", 32768, 262144,
      ),
      supportsToolCalling,
      supportsStructuredOutput,
    }],
    timeoutMs: Number(env.KINGS_SELF_HOSTED_TIMEOUT_MS?.trim() || 120000),
  });
}
