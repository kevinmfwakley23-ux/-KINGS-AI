import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";

import type {
  OllamaExecutionClient,
} from "./ollama-execution-client";

export class OllamaIntelligenceModel
  implements IntelligenceModel {
  readonly identity:
    ModelIdentity;

  private readonly client:
    OllamaExecutionClient;

  constructor(
    client:
      OllamaExecutionClient,
    modelId:
      string,
    capabilities:
      ModelIdentity["capabilities"],
  ) {
    this.client =
      client;

    this.identity = {
      providerId:
        "internal-intelligence",
      modelId,
      displayName:
        `Ollama: ${modelId}`,
      providerKind:
        "internal-local",
      capabilities: [
        ...capabilities,
      ],
      inputModalities: [
        "text",
      ],
      outputModalities: [
        "text",
      ],
      contextWindowTokens:
        32768,
      supportsToolCalling:
        true,
      supportsStructuredOutput:
        false,
      available:
        true,
    };
  }

  canHandle(
    request:
      ModelExecutionRequest,
  ):
    boolean {
    if (
      !this.identity.available
    ) {
      return false;
    }

    if (
      !request.inputModalities.includes(
        "text",
      )
    ) {
      return false;
    }

    if (
      request.outputModality !==
      "text"
    ) {
      return false;
    }

    const capabilities =
      new Set<string>(
        this.identity.capabilities,
      );

    return request.requiredCapabilities.every(
      (
        capability,
      ) =>
        capabilities.has(
          capability,
        ),
    );
  }

  execute(
    request:
      ModelExecutionRequest,
  ):
    Promise<
      ModelExecutionResult
    > {
    return this.client.execute(
      this.identity,
      request,
    );
  }
}
