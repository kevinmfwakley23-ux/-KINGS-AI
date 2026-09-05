import type {
  ModelIdentity,
} from "./model-interface";

import {
  ModelCapabilityRegistry,
} from "./model-capability-registry";

import {
  ModelRouter,
} from "./model-routing";

import type {
  ModelRoutingMetrics,
} from "./model-routing";

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

const internal:
  ModelIdentity = {
  providerId:
    "provider-internal",
  modelId:
    "model-internal",
  displayName:
    "K.I.N.G.S. Internal Model",
  providerKind:
    "internal-local",
  capabilities: [
    "reasoning",
    "coding",
    "debugging",
  ],
  inputModalities: [
    "text",
  ],
  outputModalities: [
    "text",
  ],
  contextWindowTokens:
    32_000,
  supportsToolCalling:
    true,
  supportsStructuredOutput:
    true,
  available:
    true,
};

const external:
  ModelIdentity = {
  providerId:
    "provider-external",
  modelId:
    "model-external",
  displayName:
    "External Model",
  providerKind:
    "external-paid",
  capabilities: [
    "reasoning",
    "coding",
    "debugging",
  ],
  inputModalities: [
    "text",
  ],
  outputModalities: [
    "text",
  ],
  contextWindowTokens:
    128_000,
  supportsToolCalling:
    true,
  supportsStructuredOutput:
    true,
  available:
    true,
};

const visionModel:
  ModelIdentity = {
  providerId:
    "provider-vision",
  modelId:
    "model-vision",
  displayName:
    "Vision Model",
  providerKind:
    "external-free",
  capabilities: [
    "reasoning",
    "coding",
  ],
  inputModalities: [
    "text",
    "image",
  ],
  outputModalities: [
    "text",
  ],
  contextWindowTokens:
    64_000,
  supportsToolCalling:
    true,
  supportsStructuredOutput:
    false,
  available:
    true,
};

const registry =
  new ModelCapabilityRegistry();

registry.register({
  model:
    internal,
  capabilities: [
    {
      capability:
        "coding",
      strength:
        92,
      status:
        "verified",
      evidenceReferences: [
        "internal-code-benchmark",
      ],
      verifiedAt:
        "2026-08-12T00:00:00.000Z",
    },
    {
      capability:
        "debugging",
      strength:
        90,
      status:
        "verified",
      evidenceReferences: [
        "internal-debug-benchmark",
      ],
      verifiedAt:
        "2026-08-12T00:00:00.000Z",
    },
  ],
});

registry.register({
  model:
    external,
  capabilities: [
    {
      capability:
        "coding",
      strength:
        98,
      status:
        "verified",
      evidenceReferences: [
        "external-code-benchmark",
      ],
      verifiedAt:
        "2026-08-12T00:00:00.000Z",
    },
    {
      capability:
        "debugging",
      strength:
        96,
      status:
        "verified",
      evidenceReferences: [
        "external-debug-benchmark",
      ],
      verifiedAt:
        "2026-08-12T00:00:00.000Z",
    },
  ],
});

registry.register({
  model:
    visionModel,
  capabilities: [
    {
      capability:
        "coding",
      strength:
        80,
      status:
        "verified",
      evidenceReferences: [
        "vision-code-benchmark",
      ],
      verifiedAt:
        "2026-08-12T00:00:00.000Z",
    },
  ],
});

const metrics:
  ReadonlyMap<
    string,
    ModelRoutingMetrics
  > =
  new Map([
    [
      "model-internal",
      {
        estimatedCost:
          0,
        latencyMs:
          500,
        reliability:
          92,
      },
    ],
    [
      "model-external",
      {
        estimatedCost:
          0.02,
        latencyMs:
          700,
        reliability:
          98,
      },
    ],
    [
      "model-vision",
      {
        estimatedCost:
          0,
        latencyMs:
          900,
        reliability:
          80,
      },
    ],
  ]);

const router =
  new ModelRouter(
    registry,
    metrics,
  );

const coding =
  router.route({
    requiredCapabilities: [
      "coding",
      "debugging",
    ],
  });

assert(
  coding.selected,
  "Capable coding model was not selected.",
);

assert(
  coding.modelId ===
    "model-internal",
  "Least-expensive capable model was not selected.",
);

assert(
  coding.providerId ===
    "provider-internal",
  "Selected provider identity was not preserved.",
);

console.log(
  "04.4 least-expensive capable model routing: SUCCESS",
);

const qualityFirst =
  router.route({
    requiredCapabilities: [
      "coding",
      "debugging",
    ],
    minimumCapabilityStrength:
      95,
  });

assert(
  qualityFirst.selected,
  "High-quality capable model was not selected.",
);

assert(
  qualityFirst.modelId ===
    "model-external",
  "Minimum capability strength routing failed.",
);

console.log(
  "04.4 capability threshold routing: SUCCESS",
);

const internalPreferred =
  router.route({
    requiredCapabilities: [
      "coding",
    ],
    preferInternal:
      true,
  });

assert(
  internalPreferred.modelId ===
    "model-internal",
  "Internal intelligence preference failed.",
);

console.log(
  "04.4 internal intelligence preference: SUCCESS",
);

const internalOnly =
  router.route({
    requiredCapabilities: [
      "coding",
    ],
    internalOnly:
      true,
  });

assert(
  internalOnly.selected &&
  internalOnly.modelId ===
    "model-internal" &&
  internalOnly.candidates.every(
    (candidate) =>
      candidate.internal,
  ),
  "Internal-only routing must exclude every external candidate.",
);

console.log(
  "04.4 internal-only routing: SUCCESS",
);

const internalOnlyFailClosed =
  router.route({
    requiredCapabilities: [
      "coding",
    ],
    minimumCapabilityStrength:
      95,
    internalOnly:
      true,
  });

assert(
  !internalOnlyFailClosed.selected &&
  internalOnlyFailClosed.candidates.length ===
    0,
  "Internal-only routing must fail closed rather than fall back to a stronger external model.",
);

assert(
  internalOnlyFailClosed.reason.includes(
    "internal",
  ),
  "Internal-only routing failure must explain the internal constraint.",
);

console.log(
  "04.4 internal-only fail-closed routing: SUCCESS",
);

const freeExternalBlocked =
  router.route({
    requiredCapabilities: [
      "coding",
    ],
    requiredInputModality:
      "image",
    maximumEstimatedCost:
      0,
    internalOnly:
      true,
  });

assert(
  !freeExternalBlocked.selected,
  "Internal-only routing must block an external-free model even when it satisfies the zero-cost ceiling.",
);

console.log(
  "04.4 internal-only blocks free external fallback: SUCCESS",
);

const structured =
  router.route({
    requiredCapabilities: [
      "coding",
    ],
    requireStructuredOutput:
      true,
  });

assert(
  structured.modelId ===
    "model-internal",
  "Structured-output routing failed.",
);

console.log(
  "04.4 structured-output compatibility: SUCCESS",
);

const image =
  router.route({
    requiredCapabilities: [
      "coding",
    ],
    requiredInputModality:
      "image",
  });

assert(
  image.modelId ===
    "model-vision",
  "Input modality routing failed.",
);

console.log(
  "04.4 modality-aware routing: SUCCESS",
);

const costLimited =
  router.route({
    requiredCapabilities: [
      "coding",
      "debugging",
    ],
    maximumEstimatedCost:
      0,
  });

assert(
  costLimited.modelId ===
    "model-internal",
  "Maximum-cost routing failed.",
);

console.log(
  "04.4 cost ceiling routing: SUCCESS",
);

const noMatch =
  router.route({
    requiredCapabilities: [
      "research",
    ],
  });

assert(
  !noMatch.selected,
  "Unsupported capability must not produce a routing selection.",
);

assert(
  noMatch.candidates.length ===
    0,
  "Unsupported capability must not produce candidates.",
);

console.log(
  "04.4 no-capable-model handling: SUCCESS",
);

const deterministicA =
  router.route({
    requiredCapabilities: [
      "coding",
    ],
  });

const deterministicB =
  router.route({
    requiredCapabilities: [
      "coding",
    ],
  });

assert(
  deterministicA.modelId ===
    deterministicB.modelId,
  "Routing must be deterministic.",
);

assert(
  deterministicA.providerId ===
    deterministicB.providerId,
  "Routing provider selection must be deterministic.",
);

console.log(
  "04.4 deterministic routing: SUCCESS",
);

assert(
  coding.reason.length >
    0,
  "Routing decision must contain an explanation.",
);

assert(
  coding.candidates.length >
    0,
  "Routing decision must preserve candidate evidence.",
);

console.log(
  "04.4 explainable routing decision: SUCCESS",
);

const tieMetrics:
  ReadonlyMap<
    string,
    ModelRoutingMetrics
  > =
  new Map([
    [
      "model-internal",
      {
        estimatedCost:
          0,
        latencyMs:
          500,
        reliability:
          92,
      },
    ],
    [
      "model-external",
      {
        estimatedCost:
          0,
        latencyMs:
          500,
        reliability:
          92,
      },
    ],
    [
      "model-vision",
      {
        estimatedCost:
          0,
        latencyMs:
          900,
        reliability:
          80,
      },
    ],
  ]);

const tieRouter =
  new ModelRouter(
    registry,
    tieMetrics,
  );

const tieResult =
  tieRouter.route({
    requiredCapabilities: [
      "coding",
    ],
  });

assert(
  tieResult.modelId ===
    "model-external",
  "Deterministic provider/model tie-breaking failed.",
);

console.log(
  "04.4 deterministic tie-breaking: SUCCESS",
);

console.log(
  "TREE-04.4 MODEL ROUTING: SUCCESS",
);
