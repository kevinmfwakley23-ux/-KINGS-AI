import {
  OllamaProviderDiscovery,
  type OllamaModelRecord,
} from "./ollama-provider-discovery";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const discovery =
    new OllamaProviderDiscovery({
      async listModels():
        Promise<
          OllamaModelRecord[]
        > {
        return [
          {
            name:
              "test-local-model",
            size:
              123,
          },
        ];
      },
    });

  const result =
    await discovery.discover();

  assert(
    result.reachable,
    "Reachable Ollama provider must be reported as reachable.",
  );

  assert(
    result.models.length ===
      1,
    "Ollama models must be discovered.",
  );

  assert(
    result.identities[0]?.providerKind ===
      "internal-local",
    "Discovered Ollama models must become internal-local model identities.",
  );

  assert(
    result.identities[0]?.modelId ===
      "test-local-model",
    "Discovered model identity must preserve the Ollama model id.",
  );

  console.log(
    "04.OLLAMA provider discovery: SUCCESS",
  );

  const unavailable =
    new OllamaProviderDiscovery({
      async listModels() {
        throw new Error(
          "provider unavailable",
        );
      },
    });

  const unavailableResult =
    await unavailable.discover();

  assert(
    unavailableResult.reachable ===
      false,
    "Unavailable Ollama provider must degrade without crashing K.I.N.G.S.",
  );

  assert(
    unavailableResult.models.length ===
      0,
    "Unavailable provider must not expose phantom models.",
  );

  console.log(
    "04.OLLAMA unavailable-provider protection: SUCCESS",
  );

  console.log(
    "TREE-04 OLLAMA PROVIDER DISCOVERY: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
