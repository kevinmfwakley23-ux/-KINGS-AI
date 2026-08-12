import type {
  IntelligenceCapability,
  ModelIdentity,
} from "./model-interface";

import {
  ModelCapabilityRegistry,
} from "./model-capability-registry";

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

const internalModel:
  ModelIdentity = {
  providerId:
    "provider-internal",
  modelId:
    "model-internal-code",
  displayName:
    "K.I.N.G.S. Internal Coding Model",
  providerKind:
    "internal-local",
  capabilities: [
    "reasoning",
    "planning",
    "coding",
    "debugging",
    "research",
    "source-inspection",
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

const researchModel:
  ModelIdentity = {
  providerId:
    "provider-research",
  modelId:
    "model-research",
  displayName:
    "K.I.N.G.S. Research Model",
  providerKind:
    "external-free",
  capabilities: [
    "reasoning",
    "research",
    "web-learning",
  ],
  inputModalities: [
    "text",
  ],
  outputModalities: [
    "text",
  ],
  contextWindowTokens:
    64_000,
  supportsToolCalling:
    true,
  supportsStructuredOutput:
    true,
  available:
    true,
};

const registry =
  new ModelCapabilityRegistry();

registry.register({
  model:
    internalModel,
  capabilities: [
    {
      capability:
        "coding",
      strength:
        95,
      status:
        "verified",
      evidenceReferences: [
        "benchmark-coding-001",
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
        "benchmark-debugging-001",
      ],
      verifiedAt:
        "2026-08-12T00:00:00.000Z",
    },
    {
      capability:
        "research",
      strength:
        75,
      status:
        "verified",
      evidenceReferences: [
        "benchmark-research-001",
      ],
      verifiedAt:
        "2026-08-12T00:00:00.000Z",
    },
  ],
});

registry.register({
  model:
    researchModel,
  capabilities: [
    {
      capability:
        "research",
      strength:
        94,
      status:
        "verified",
      evidenceReferences: [
        "benchmark-research-002",
      ],
      verifiedAt:
        "2026-08-12T00:00:00.000Z",
    },
    {
      capability:
        "web-learning",
      strength:
        92,
      status:
        "verified",
      evidenceReferences: [
        "benchmark-web-001",
      ],
      verifiedAt:
        "2026-08-12T00:00:00.000Z",
    },
  ],
});

assert(
  registry.list().length ===
    2,
  "Model capability registry registration failed.",
);

console.log(
  "04.3 model capability registration: SUCCESS",
);

const codingModels =
  registry.discover({
    requiredCapabilities: [
      "coding",
    ],
    verifiedOnly:
      true,
    availableOnly:
      true,
  });

assert(
  codingModels.length ===
    1,
  "Verified coding model discovery failed.",
);

assert(
  codingModels[0].model.modelId ===
    "model-internal-code",
  "Internal coding model was not discovered.",
);

console.log(
  "04.3 capability-specific model discovery: SUCCESS",
);

const researchModels =
  registry.discover({
    requiredCapabilities: [
      "research",
    ],
    verifiedOnly:
      true,
  });

assert(
  researchModels.length ===
    2,
  "Research capability discovery failed.",
);

assert(
  researchModels[0].model.modelId ===
    "model-research",
  "Highest-strength research model was not prioritized.",
);

console.log(
  "04.3 capability strength ordering: SUCCESS",
);

const strongCoding =
  registry.discover({
    requiredCapabilities: [
      "coding",
    ],
    minimumStrength:
      90,
    verifiedOnly:
      true,
  });

assert(
  strongCoding.length ===
    1,
  "Minimum capability strength filtering failed.",
);

assert(
  strongCoding[0].weakestRequiredStrength ===
    95,
  "Required capability strength was not preserved.",
);

console.log(
  "04.3 minimum capability strength: SUCCESS",
);

const unavailableQuery =
  registry.discover({
    requiredCapabilities: [
      "coding",
    ],
    availableOnly:
      true,
  });

assert(
  unavailableQuery.every(
    (
      match,
    ) =>
      match.model.available,
  ),
  "Unavailable models must not be returned when availability is required.",
);

console.log(
  "04.3 model availability filtering: SUCCESS",
);

let duplicateRejected =
  false;

try {
  registry.register({
    model:
      internalModel,
    capabilities: [],
  });
} catch {
  duplicateRejected =
    true;
}

assert(
  duplicateRejected,
  "Duplicate model registration must be rejected.",
);

console.log(
  "04.3 duplicate model rejection: SUCCESS",
);

let invalidStrengthRejected =
  false;

try {
  registry.register({
    model: {
      ...internalModel,
      modelId:
        "model-invalid-strength",
    },
    capabilities: [
      {
        capability:
          "coding",
        strength:
          101,
        status:
          "unverified",
        evidenceReferences: [],
      },
    ],
  });
} catch {
  invalidStrengthRejected =
    true;
}

assert(
  invalidStrengthRejected,
  "Invalid capability strength must be rejected.",
);

console.log(
  "04.3 invalid capability strength rejection: SUCCESS",
);

let verifiedEvidenceRejected =
  false;

try {
  registry.register({
    model: {
      ...internalModel,
      modelId:
        "model-no-evidence",
    },
    capabilities: [
      {
        capability:
          "coding",
        strength:
          80,
        status:
          "verified",
        evidenceReferences: [],
      },
    ],
  });
} catch {
  verifiedEvidenceRejected =
    true;
}

assert(
  verifiedEvidenceRejected,
  "Verified capability without evidence must be rejected.",
);

console.log(
  "04.3 verified capability evidence requirement: SUCCESS",
);

registry.recordVerification(
  "model-internal-code",
  "research",
  "verified",
  82,
  [
    "benchmark-research-003",
  ],
  "2026-08-12T00:00:00.000Z",
);

const updated =
  registry.get(
    "model-internal-code",
  );

assert(
  updated?.capabilities.some(
    (
      profile,
    ) =>
      profile.capability ===
        "research" &&
      profile.strength ===
        82 &&
      profile.status ===
        "verified",
  ) === true,
  "Capability verification update failed.",
);

console.log(
  "04.3 capability verification update: SUCCESS",
);

const codingCapability =
  updated?.capabilities.find(
    (
      profile,
    ) =>
      profile.capability ===
      "coding",
  );

assert(
  codingCapability?.evidenceReferences.includes(
    "benchmark-coding-001",
  ) === true,
  "Capability evidence provenance was not preserved.",
);

console.log(
  "04.3 capability evidence provenance: SUCCESS",
);

const requiredCapabilities:
  IntelligenceCapability[] = [
  "coding",
  "debugging",
];

const multiCapability =
  registry.discover({
    requiredCapabilities,
    verifiedOnly:
      true,
  });

assert(
  multiCapability.length ===
    1,
  "Multi-capability model matching failed.",
);

assert(
  multiCapability[0].weakestRequiredStrength ===
    90,
  "Multi-capability matching did not expose the weakest required capability.",
);

console.log(
  "04.3 multi-capability matching: SUCCESS",
);

console.log(
  "TREE-04.3 MODEL CAPABILITY REGISTRY: SUCCESS",
);
