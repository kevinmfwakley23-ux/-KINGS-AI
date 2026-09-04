import type { ModelExecutionRequest } from "./model-interface";

export interface ModelContextCapacityOptions {
  /** Conservative approximation for code-heavy prompts. */
  charactersPerToken?: number;
  /** Default completion reserve when the request does not declare one. */
  defaultOutputTokens?: number;
  /** Fractional headroom added after input and output reservations. */
  safetyMarginRatio?: number;
  /** Absolute minimum safety headroom. */
  minimumSafetyMarginTokens?: number;
}

export interface ModelContextCapacityEstimate {
  messageCharacters: number;
  toolSchemaCharacters: number;
  estimatedInputTokens: number;
  reservedOutputTokens: number;
  safetyMarginTokens: number;
  requiredContextTokens: number;
}

function finitePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isFinite(value) && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function serializedToolCharacters(request: ModelExecutionRequest): number {
  return (request.toolDefinitions ?? []).reduce((total, tool) => {
    let schema = "";
    try {
      schema = JSON.stringify(tool.inputSchema);
    } catch {
      // Provider tool schemas are required to be JSON-compatible. If an
      // invalid/cyclic object reaches this estimator, reserve a conservative
      // fixed envelope rather than pretending it costs nothing.
      schema = "x".repeat(4_096);
    }
    return total + tool.toolId.length + tool.description.length + schema.length;
  }, 0);
}

export function estimateModelContextCapacity(
  request: ModelExecutionRequest,
  options: ModelContextCapacityOptions = {},
): ModelContextCapacityEstimate {
  const charactersPerToken = finitePositiveInteger(
    options.charactersPerToken,
    3,
  );
  const defaultOutputTokens = finitePositiveInteger(
    options.defaultOutputTokens,
    2_048,
  );
  const minimumSafetyMarginTokens = finitePositiveInteger(
    options.minimumSafetyMarginTokens,
    1_024,
  );
  const safetyMarginRatio =
    options.safetyMarginRatio !== undefined &&
    Number.isFinite(options.safetyMarginRatio) &&
    options.safetyMarginRatio >= 0 &&
    options.safetyMarginRatio <= 1
      ? options.safetyMarginRatio
      : 0.12;

  const messageCharacters = request.messages.reduce(
    (total, message) => total + message.role.length + message.content.length,
    0,
  );
  const toolSchemaCharacters = serializedToolCharacters(request);
  const estimatedInputTokens = Math.max(
    1,
    Math.ceil((messageCharacters + toolSchemaCharacters) / charactersPerToken),
  );
  const reservedOutputTokens = finitePositiveInteger(
    request.maxOutputTokens,
    defaultOutputTokens,
  );
  const safetyMarginTokens = Math.max(
    minimumSafetyMarginTokens,
    Math.ceil(
      (estimatedInputTokens + reservedOutputTokens) * safetyMarginRatio,
    ),
  );
  const requiredContextTokens =
    estimatedInputTokens + reservedOutputTokens + safetyMarginTokens;

  return {
    messageCharacters,
    toolSchemaCharacters,
    estimatedInputTokens,
    reservedOutputTokens,
    safetyMarginTokens,
    requiredContextTokens,
  };
}
