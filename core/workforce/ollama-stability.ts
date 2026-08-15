import {
  setTimeout as sleep,
} from "node:timers/promises";

export interface OllamaHealthResult {
  healthy: boolean;
  model: string;
  attempts: number;
  error?: string;
}

export interface OllamaGenerateRetryOptions {
  model: string;
  baseUrl?: string;
  body: Record<string, unknown>;
  maxAttempts: number;
  retryDelayMs: number;
  timeoutMs: number;
}

function abortableSignal(
  timeoutMs: number,
): AbortSignal {
  return AbortSignal.timeout(
    timeoutMs,
  );
}

export async function checkOllamaModel(
  model: string,
  baseUrl = "http://127.0.0.1:11434",
): Promise<OllamaHealthResult> {
  try {
    const response =
      await fetch(
        `${baseUrl}/api/tags`,
        {
          signal:
            abortableSignal(5000),
        },
      );

    if (!response.ok) {
      return {
        healthy:
          false,
        model,
        attempts:
          1,
        error:
          `Ollama tags request returned ${response.status}.`,
      };
    }

    const payload =
      (await response.json()) as {
        models?: Array<{
          name?: string;
        }>;
      };

    const found =
      payload.models?.some(
        (
          entry,
        ) =>
          entry.name ===
          model,
      ) ?? false;

    return {
      healthy:
        found,
      model,
      attempts:
        1,
      error:
        found
          ? undefined
          : `Model "${model}" is not available in Ollama.`,
    };
  } catch (
    error
  ) {
    return {
      healthy:
        false,
      model,
      attempts:
        1,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

export async function generateWithOllamaRetry(
  options:
    OllamaGenerateRetryOptions,
): Promise<{
  response: string;
  attempts: number;
}> {
  const baseUrl =
    options.baseUrl ??
    "http://127.0.0.1:11434";

  let lastError =
    "Unknown Ollama failure.";

  for (
    let attempt = 1;
    attempt <=
      options.maxAttempts;
    attempt++
  ) {
    try {
      const response =
        await fetch(
          `${baseUrl}/api/generate`,
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                ...options.body,
                model:
                  options.model,
              }),

            signal:
              abortableSignal(
                options.timeoutMs,
              ),
          },
        );

      const raw =
        await response.text();

      if (!response.ok) {
        throw new Error(
          `Ollama HTTP ${response.status}: ${raw}`,
        );
      }

      const lines =
        raw
          .split("\n")
          .map(
            (
              line,
            ) =>
              line.trim(),
          )
          .filter(
            (
              line,
            ) =>
              line.length >
              0,
          );

      const responses: string[] = [];

      for (
        const line of
        lines
      ) {
        const chunk =
          JSON.parse(
            line,
          ) as {
            response?: string;
          };

        if (
          typeof chunk.response ===
          "string"
        ) {
          responses.push(
            chunk.response,
          );
        }
      }

      const result =
        responses.join("");

      if (
        result.length ===
        0
      ) {
        throw new Error(
          "Ollama returned an empty response.",
        );
      }

      return {
        response:
          result,
        attempts:
          attempt,
      };
    } catch (
      error
    ) {
      lastError =
        error instanceof Error
          ? error.message
          : String(error);

      if (
        attempt <
        options.maxAttempts
      ) {
        await sleep(
          options.retryDelayMs *
            attempt,
        );
      }
    }
  }

  throw new Error(
    [
      "K.I.N.G.S. Ollama request failed after bounded retries.",
      lastError,
    ].join("\n"),
  );
}
