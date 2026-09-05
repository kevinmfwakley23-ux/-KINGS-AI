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
    providerId =
      "internal-intelligence",
  ) {
    this.client =
      client;

    if (!providerId.trim()) {
      throw new Error(
        "K.I.N.G.S. Ollama Model: provider id is required",
      );
    }

    this.identity = {
      providerId:
        providerId.trim(),
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
        false,
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
      !request.inputModalities.every(
        (modality) =>
          this.identity.inputModalities.includes(
            modality,
          ),
      )
    ) {
      return false;
    }

    if (
      !this.identity.outputModalities.includes(
        request.outputModality,
      )
    ) {
      return false;
    }

    if (
      request.requireStructuredOutput
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