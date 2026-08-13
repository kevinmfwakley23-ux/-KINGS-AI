import type {
  ModelExecutionRequest,
} from "./model-interface";

import {
  OllamaIntelligenceModel,
} from "./ollama-intelligence-model";

import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
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

async function main(): Promise<void> {
  const transport:
    OllamaHttpTransport = {
    async post(
      path,
      body,
    ) {
      const response =
        await fetch(
          `http://127.0.0.1:11434${path}`,
          {
            method:
              "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body:
              JSON.stringify(
                body,
              ),
          },
        );

      if (
        !response.ok
      ) {
        const text =
          await response.text();

        throw new Error(
          `Ollama HTTP ${response.status}: ${text}`,
        );
      }

      return response.json();
    },
  };

  const model =
    new OllamaIntelligenceModel(
      new HttpOllamaExecutionClient(
        transport,
      ),
      "qwen2.5-coder:0.5b",
      [
        "reasoning",
        "planning",
        "coding",
        "debugging",
        "research",
        "source-inspection",
        "tool-use",
        "verification",
        "recovery",
      ],
    );

  const request:
    ModelExecutionRequest = {
    id:
      "ollama-real-request",
    taskId:
      "ollama-real-task",
    missionId:
      "ollama-real-mission",
    messages: [
      {
        role:
          "user",
        content:
          "Return exactly: KINGS_REAL_MODEL_GREEN",
      },
    ],
    requiredCapabilities: [
      "coding",
      "reasoning",
    ],
    inputModalities: [
      "text",
    ],
    outputModality:
      "text",
    maxOutputTokens:
      64,
    allowToolProposals:
      false,
  };

  assert(
    model.canHandle(
      request,
    ),
    "Real Ollama model must satisfy the requested capabilities.",
  );

  console.log(
    "04.REAL model capability contract: SUCCESS",
  );

  const result =
    await model.execute(
      request,
    );

  if (
    !result.success
  ) {
    throw new Error(
      result.failure?.message ??
        "Real Ollama model execution failed.",
    );
  }

  const content =
    result.response?.content.trim() ??
    "";

  assert(
    content.length > 0,
    "Real Ollama model returned no content.",
  );

  console.log(
    "04.REAL Ollama inference: SUCCESS",
  );

  console.log(
    `04.REAL model response: ${content}`,
  );

  assert(
    result.response?.model.modelId ===
      "qwen2.5-coder:0.5b",
    "Returned model identity is incorrect.",
  );

  console.log(
    "04.REAL model identity verification: SUCCESS",
  );

  console.log(
    "TREE-04 REAL OLLAMA MODEL ADAPTER: SUCCESS",
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
