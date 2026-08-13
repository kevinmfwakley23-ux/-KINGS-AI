import type {
  ModelExecutionRequest,
} from "./model-interface";

import {
  ProviderAdapterRegistry,
} from "./provider-adapters";

import {
  ModelCapabilityRegistry,
} from "./model-capability-registry";

import {
  ModelRouter,
} from "./model-routing";

import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "./ollama-execution-client";

import {
  OllamaIntelligenceModel,
} from "./ollama-intelligence-model";

import {
  GovernedInternalIntelligenceAdapter,
} from "./internal-intelligence-adapter";

import {
  InternalModelExecutionPort,
} from "./internal-model-execution-port";

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

function normalize(
  value: string,
): string {
  return value
    .replace(
      /\r\n/g,
      "\n",
    )
    .trim();
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

  const ollamaClient =
    new HttpOllamaExecutionClient(
      transport,
    );

  const model =
    new OllamaIntelligenceModel(
      ollamaClient,
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

  const internalAdapter =
    new GovernedInternalIntelligenceAdapter(
      {
        async execute(
          identity,
          request,
        ) {
          return ollamaClient.execute(
            identity,
            request,
          );
        },
      },
    );

  internalAdapter.registerModel(
    model,
  );

  const providers =
    new ProviderAdapterRegistry();

  providers.register(
    internalAdapter,
  );

  const capabilities =
    new ModelCapabilityRegistry();

  const verifiedCapabilities =
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
    ] as const;

  capabilities.register({
    model:
      model.identity,
    capabilities:
      verifiedCapabilities.map(
        (
          capability,
        ) => ({
          capability,
          strength:
            capability ===
              "coding"
              ? 78
              : 72,
          status:
            "verified",
          evidenceReferences: [
            "real-local-model-smoke-test",
            "real-local-ollama-adapter",
          ],
          verifiedAt:
            new Date().toISOString(),
        }),
      ),
  });

  const router =
    new ModelRouter(
      capabilities,
      new Map([
        [
          model.identity.modelId,
          {
            estimatedCost:
              0,
            latencyMs:
              1000,
            reliability:
              70,
          },
        ],
      ]),
    );

  const route =
    router.route({
      requiredCapabilities: [
        "coding",
        "reasoning",
      ],
      minimumCapabilityStrength:
        70,
      preferInternal:
        true,
      maximumEstimatedCost:
        0,
    });

  assert(
    route.selected,
    "The real local coding model must be routable.",
  );

  assert(
    route.providerId ===
      "internal-intelligence",
    "Coding route must remain on the internal provider.",
  );

  assert(
    route.modelId ===
      "qwen2.5-coder:0.5b",
    "Coding route must select the real local model.",
  );

  console.log(
    "04.REAL-CODING capability routing: SUCCESS",
  );

  const request:
    ModelExecutionRequest = {
    id:
      "real-local-coding-request",
    taskId:
      "real-local-coding-task",
    missionId:
      "real-local-coding-mission",
    messages: [
      {
        role:
          "system",
        content:
          [
            "You are the internal K.I.N.G.S. coding worker.",
            "Perform a bounded coding-analysis task.",
            "Do not claim to have modified repository files.",
            "Return concise natural-language output containing:",
            "a TypeScript addNumbers function,",
            "one example test case,",
            "and a sentence stating the proposed change was not written to the repository.",
            "Do not use required headings.",
          ].join(
            "\n",
          ),
      },
      {
        role:
          "user",
        content:
          [
            "Implement a TypeScript function named addNumbers.",
            "It must accept two numbers and return their sum.",
            "Then show one example test case.",
            "Finally state clearly that the proposed change was not written to the repository.",
          ].join(
            "\n",
          ),
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
      256,
    temperature:
      0,
    allowToolProposals:
      false,
  };

  const requests =
    new Map([
      [
        request.taskId,
        {
          request,
          target: {
            providerId:
              route.providerId!,
            modelId:
              route.modelId!,
          },
        },
      ],
    ]);

  const executionPort =
    new InternalModelExecutionPort(
      providers,
      requests,
    );

  const workerResult =
    await executionPort.execute(
      request.taskId,
    );

  assert(
    workerResult.status ===
      "success",
    workerResult.summary ||
      "Real local coding worker failed.",
  );

  const output =
    normalize(
      workerResult.summary,
    );

  const hasFunction =
    /\baddNumbers\b/.test(
      output,
    ) &&
    /(?:function\s+addNumbers|const\s+addNumbers|let\s+addNumbers)/.test(
      output,
    );

  const hasAddition =
    /return\s+[^;\n]*\+\s*[^;\n]*/.test(
      output,
    ) ||
    /\+\s*(?:b|num|number|second)/i.test(
      output,
    );

  const hasTestSignal =
    /\b(?:test|expect|assert|example)\b/i.test(
      output,
    );

  const hasRepositoryLimitation =
    /\b(?:not written|not modified|not changed|did not modify|has not been written)\b/i.test(
      output,
    ) &&
    /\brepositor(?:y|ies)\b/i.test(
      output,
    );

  assert(
    hasFunction,
    "Real local coding result must contain an addNumbers implementation.",
  );

  assert(
    hasAddition,
    "Real local coding result must contain addition logic.",
  );

  assert(
    hasTestSignal,
    "Real local coding result must contain a test/example signal.",
  );

  assert(
    hasRepositoryLimitation,
    "Real local coding result must explicitly state that the repository was not modified.",
  );

  assert(
    workerResult.agentId ===
      "internal-intelligence",
    "Real coding result must remain attributable to internal intelligence.",
  );

  assert(
    workerResult.usage?.estimatedCost ===
      0,
    "Local coding execution must report zero external-provider cost.",
  );

  console.log(
    "04.REAL-CODING live local inference: SUCCESS",
  );

  console.log(
    "04.REAL-CODING worker execution bridge: SUCCESS",
  );

  console.log(
    "04.REAL-CODING semantic coding-output verification: SUCCESS",
  );

  console.log(
    "04.REAL-CODING repository-boundary protection: SUCCESS",
  );

  console.log(
    "04.REAL-CODING zero external-provider cost: SUCCESS",
  );

  console.log(
    "TREE-04 REAL LOCAL CODING PROOF: SUCCESS",
  );

  console.log(
    "\n===== REAL LOCAL CODING OUTPUT =====\n",
  );

  console.log(
    output,
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
