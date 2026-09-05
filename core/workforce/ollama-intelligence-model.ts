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
      // The current Ollama /api/generate execution path returns text only.
      // Do not advertise tool calling until proposals are parsed and governed.
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
        (
          modality,
        ) =>
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
      request.requireStructuredOutput &&
      !this.identity.supportsStructuredOutput
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
