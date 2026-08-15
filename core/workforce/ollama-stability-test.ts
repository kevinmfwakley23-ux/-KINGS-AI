import {
  checkOllamaModel,
  generateWithOllamaRetry,
} from "./ollama-stability";

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

async function main(): Promise<void> {
  const model =
    "qwen2.5-coder:1.5b";

  const health =
    await checkOllamaModel(
      model,
    );

  assert(
    health.healthy,
    health.error ??
      "Ollama model health check failed.",
  );

  console.log(
    "001.OLLAMA STABILITY → MODEL HEALTH: SUCCESS",
  );

  const result =
    await generateWithOllamaRetry({
      model,

      body: {
        prompt:
          'Return only this exact JSON: {"status":"KINGS_OLLAMA_STABLE"}',
        stream:
          false,
      },

      maxAttempts:
        2,

      retryDelayMs:
        500,

      timeoutMs:
        30000,
    });

  assert(
    result.response.includes(
      "KINGS_OLLAMA_STABLE",
    ),
    "Ollama response must contain the expected stability marker.",
  );

  console.log(
    "002.OLLAMA STABILITY → GENERATION: SUCCESS",
  );

  console.log(
    `003.OLLAMA STABILITY → ATTEMPTS: ${result.attempts}`,
  );

  console.log(
    "K.I.N.G.S. OLLAMA STABILITY: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );
  },
);
