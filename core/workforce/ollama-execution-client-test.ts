import type {
  ModelExecutionRequest,
  ModelIdentity,
} from "./model-interface";

import {
  HttpOllamaExecutionClient,
} from "./ollama-execution-client";

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

function model():
  ModelIdentity {
  return {
    providerId:
      "ollama-internal",
    modelId:
      "test-local-model",
    displayName:
      "Ollama Test Local Model",
    providerKind:
      "internal-local",
    capabilities: [
      "reasoning",
      "coding",
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
  };
}

function request():
  ModelExecutionRequest {
  return {
    id:
      "ollama-request-001",
    taskId:
      "ollama-task-001",
    missionId:
      "ollama-mission-001",
    messages: [
      {
        role:
          "user",
        content:
          "Return a local test response.",
      },
    ],
    requiredCapabilities: [
      "reasoning",
    ],
    inputModalities: [
      "text",
    ],
    outputModality:
      "text",
    allowToolProposals:
      false,
  };
}

async function main(): Promise<void> {
  const client =
    new HttpOllamaExecutionClient({
      async post(
        path,
        body,
      ) {
        assert(
          path ===
            "/api/generate",
          "Ollama generate endpoint was not selected.",
        );

        const requestBody =
          body as {
            model:
              string;
            prompt:
              string;
            stream:
              boolean;
          };

        assert(
          requestBody.model ===
            "test-local-model",
          "Ollama model id was not propagated.",
        );

        assert(
          requestBody.stream ===
            false,
          "K.I.N.G.S. must use non-streaming execution for this transport.",
        );

        return {
          response:
            "OLLAMA-GENERATION-OK",
          done:
            true,
        };
      },
    });

  const result =
    await client.execute(
      model(),
      request(),
    );

  assert(
    result.success,
    "Ollama execution transport should succeed against a valid response.",
  );

  assert(
    result.response?.content ===
      "OLLAMA-GENERATION-OK",
    "Ollama generated response did not cross the K.I.N.G.S. model contract.",
  );

  console.log(
    "04.OLLAMA execution request contract: SUCCESS",
  );

  console.log(
    "04.OLLAMA response adaptation: SUCCESS",
  );

  const unavailable =
    new HttpOllamaExecutionClient({
      async post() {
        throw new Error(
          "connect ECONNREFUSED",
        );
      },
    });

  const unavailableResult =
    await unavailable.execute(
      model(),
      request(),
    );

  assert(
    unavailableResult.success ===
      false &&
    unavailableResult.failure?.code ===
      "OLLAMA_TRANSPORT_ERROR",
    "Ollama transport failure must be converted into a governed model failure.",
  );

  console.log(
    "04.OLLAMA unavailable transport protection: SUCCESS",
  );

  const malformed =
    new HttpOllamaExecutionClient({
      async post() {
        return {
          done:
            true,
        };
      },
    });

  const malformedResult =
    await malformed.execute(
      model(),
      request(),
    );

  assert(
    malformedResult.success ===
      false &&
    malformedResult.failure?.code ===
      "OLLAMA_MISSING_RESPONSE",
    "Malformed Ollama output must never be promoted to successful model execution.",
  );

  console.log(
    "04.OLLAMA malformed response protection: SUCCESS",
  );

  console.log(
    "TREE-04 OLLAMA EXECUTION TRANSPORT: SUCCESS",
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
