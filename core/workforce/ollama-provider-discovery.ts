import type {
  ModelIdentity,
} from "./model-interface";

export interface OllamaModelRecord {
  name:
    string;

  digest?:
    string;

  size?:
    number;

  modifiedAt?:
    string;
}

export interface OllamaProviderDiscoveryResult {
  reachable:
    boolean;

  providerId:
    string;

  models:
    OllamaModelRecord[];

  identities:
    ModelIdentity[];
}

export interface OllamaProviderDiscoveryClient {
  listModels():
    Promise<
      OllamaModelRecord[]
    >;
}

export class OllamaProviderDiscovery {
  readonly providerId =
    "ollama-internal";

  constructor(
    private readonly client:
      OllamaProviderDiscoveryClient,
  ) {}

  async discover():
    Promise<
      OllamaProviderDiscoveryResult
    > {
    try {
      const models =
        await this.client.listModels();

      return {
        reachable:
          true,
        providerId:
          this.providerId,
        models: [
          ...models,
        ],
        identities:
          models.map(
            (
              model,
            ) => ({
              providerId:
                this.providerId,
              modelId:
                model.name,
              displayName:
                `Ollama: ${model.name}`,
              providerKind:
                "internal-local",
              capabilities: [
                "reasoning",
                "planning",
                "coding",
                "debugging",
                "research",
                "source-inspection",
                "verification",
                "recovery",
              ],
              inputModalities: [
                "text",
              ],
              outputModalities: [
                "text",
              ],
              contextWindowTokens:
                4096,
              supportsToolCalling:
                false,
              supportsStructuredOutput:
                false,
              available:
                true,
            }),
          ),
      };
    } catch {
      return {
        reachable:
          false,
        providerId:
          this.providerId,
        models: [],
        identities: [],
      };
    }
  }
}
