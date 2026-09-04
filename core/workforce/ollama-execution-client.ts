import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";

export interface OllamaExecutionClient {
  execute(
    model:
      ModelIdentity,
    request:
      ModelExecutionRequest,
  ):
    Promise<
      ModelExecutionResult
    >;
}

export interface OllamaHttpTransport {
  post(
    path:
      string,
    body:
      unknown,
  ):
    Promise<unknown>;
}

export class HttpOllamaExecutionClient
  implements OllamaExecutionClient {
  constructor(
    private readonly transport:
      OllamaHttpTransport,
  ) {}

  async execute(
    model:
      ModelIdentity,
    request:
      ModelExecutionRequest,
  ):
    Promise<
      ModelExecutionResult
    > {
    const startedAt =
      new Date();

    try {
      const response =
        await this.transport.post(
          "/api/generate",
          {
            model:
              model.modelId,
            prompt:
              request.messages
                .map(
                  (
                    message,
                  ) =>
                    `${message.role}: ${message.content}`,
                )
                .join(
                  "\n",
                ),
            stream:
              false,
            ...(request.maxOutputTokens !== undefined
              ? { options: { num_predict: request.maxOutputTokens } }
              : {}),
          },
        );

      if (
        !response ||
        typeof response !==
          "object"
      ) {
        return this.failure(
          request,
          model,
          startedAt,
          "OLLAMA_INVALID_RESPONSE",
          "Ollama returned a non-object response.",
          false,
        );
      }

      const payload =
        response as {
          response?:
            unknown;
          done?:
            unknown;
          prompt_eval_count?:
            unknown;
          eval_count?:
            unknown;
        };

      if (
        typeof payload.response !==
        "string"
      ) {
        return this.failure(
          request,
          model,
          startedAt,
          "OLLAMA_MISSING_RESPONSE",
          "Ollama response did not contain generated text.",
          false,
        );
      }

      const completedAt =
        new Date();

      return {
        success:
          true,
        response: {
          requestId:
            request.id,
          model,
          content:
            payload.response,
          toolCallProposals: [],
          usage: {
            elapsedMs:
              completedAt.getTime() -
              startedAt.getTime(),
            tokensUsed:
              (typeof payload.prompt_eval_count === "number"
                ? payload.prompt_eval_count
                : 0) +
              (typeof payload.eval_count === "number"
                ? payload.eval_count
                : 0),
            iterationsUsed:
              1,
            inputTokens:
              typeof payload.prompt_eval_count === "number"
                ? payload.prompt_eval_count
                : 0,
            outputTokens:
              typeof payload.eval_count === "number"
                ? payload.eval_count
                : 0,
            estimatedCost:
              0,
          },
          metadata: {
            requestId:
              request.id,
            startedAt:
              startedAt.toISOString(),
            completedAt:
              completedAt.toISOString(),
            latencyMs:
              completedAt.getTime() -
              startedAt.getTime(),
          },
        },
      };
    } catch (
      error
    ) {
      return this.failure(
        request,
        model,
        startedAt,
        "OLLAMA_TRANSPORT_ERROR",
        error instanceof Error
          ? error.message
          : String(error),
        true,
      );
    }
  }

  private failure(
    request:
      ModelExecutionRequest,
    model:
      ModelIdentity,
    startedAt:
      Date,
    code:
      string,
    message:
      string,
    retryable:
      boolean,
  ):
    ModelExecutionResult {
    const completedAt =
      new Date();

    return {
      success:
        false,
      failure: {
        requestId:
          request.id,
        providerId:
          model.providerId,
        modelId:
          model.modelId,
        retryable,
        code,
        message,
        metadata: {
          requestId:
            request.id,
          startedAt:
            startedAt.toISOString(),
          completedAt:
            completedAt.toISOString(),
          latencyMs:
            completedAt.getTime() -
            startedAt.getTime(),
        },
      },
    };
  }
}
