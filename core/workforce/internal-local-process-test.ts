import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";

import {
  createPlainTextLineProtocolModel,
  SpawnedInternalLocalProcessExecutor,
  type InternalLocalProcessCommand,
} from "./internal-local-process";

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

function createRequest():
  ModelExecutionRequest {
  return {
    id:
      "local-process-request",
    taskId:
      "local-process-task",
    missionId:
      "local-process-mission",
    messages: [
      {
        role:
          "user",
        content:
          "Return a local execution response.",
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

function createModel():
  ModelIdentity {
  return {
    providerId:
      "internal-intelligence",
    modelId:
      "local-process-test-model",
    displayName:
      "K.I.N.G.S. Local Process Test Model",
    providerKind:
      "internal-local",
    capabilities: [
      "reasoning",
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

function parseText(
  stdout: string,
  request:
    ModelExecutionRequest,
  model:
    ModelIdentity,
): ModelExecutionResult {
  return {
    success: true,
    response: {
      requestId:
        request.id,
      model,
      content:
        stdout.trim(),
      toolCallProposals: [],
      usage: {
        elapsedMs: 1,
        tokensUsed: 1,
        iterationsUsed: 1,
        inputTokens: 0,
        outputTokens: 1,
        estimatedCost: 0,
      },
      metadata: {
        requestId:
          request.id,
        startedAt:
          "2026-08-13T00:00:00.000Z",
        completedAt:
          "2026-08-13T00:00:00.001Z",
        latencyMs: 1,
      },
    },
  };
}

async function main(): Promise<void> {
  const executor =
    new SpawnedInternalLocalProcessExecutor();

  const command:
    InternalLocalProcessCommand = {
    executable:
      process.execPath,
    args: [
      "-e",
      "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('LOCAL-INFERENCE-OK\\n'));",
    ],
    timeoutMs:
      10_000,
    buildRequest:
      () =>
        "{\"test\":true}\n",
    parseResponse:
      parseText,
  };

  const result =
    await executor.execute(
      command,
      createRequest(),
      createModel(),
    );

  assert(
    result.success,
    "Local process execution must succeed.",
  );

  assert(
    result.response?.content ===
      "LOCAL-INFERENCE-OK",
    "Local process output must cross the model boundary.",
  );

  console.log(
    "04.LOCAL process execution: SUCCESS",
  );

  const timeoutResult =
    await executor.execute(
      {
        ...command,
        args: [
          "-e",
          "setTimeout(() => {}, 1000);",
        ],
        timeoutMs:
          25,
      },
      createRequest(),
      createModel(),
    );

  assert(
    timeoutResult.success ===
      false &&
    timeoutResult.failure?.code ===
      "LOCAL_PROCESS_TIMEOUT",
    "Local process timeout must be governed.",
  );

  console.log(
    "04.LOCAL timeout protection: SUCCESS",
  );

  const model =
    createPlainTextLineProtocolModel(
      executor,
      createModel(),
      process.execPath,
      [
        "-e",
        "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('LINE-PROTOCOL-OK\\n'));",
      ],
      10_000,
    );

  const modelResult =
    await model.execute(
      createRequest(),
    );

  assert(
    modelResult.success &&
    modelResult.response?.content ===
      "LINE-PROTOCOL-OK",
    "Provider-neutral local model transport must succeed.",
  );

  console.log(
    "04.LOCAL provider-neutral model transport: SUCCESS",
  );

  console.log(
    "TREE-04 LOCAL INTELLIGENCE PROCESS TRANSPORT: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode = 1;
  },
);
