import {
  CapabilityRegistry,
} from "./capability-registry";

import type {
  CapabilityManifest,
} from "./capability-registry";

import type {
  AgentDefinition,
} from "./types";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

import {
  CapabilityLoadingAuthority,
} from "./capability-loading";

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

function capability(
  id: string,
  dependencies: string[] = [],
  enabled = true,
): CapabilityManifest {
  const now =
    new Date().toISOString();

  return {
    id,
    name:
      `Capability ${id}`,
    description:
      "Deterministic Tree 03.2 capability loading test capability.",
    dependencies,
    allowedToolIds: [],
    allowedPaths: [],
    risk:
      "low",
    verificationRequirements: [
      "Capability loading test evidence.",
    ],
    enabled,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function agent(
  capabilities: string[],
): AgentDefinition {
  return {
    id:
      "agent-capability-loading-test",
    name:
      "Capability Loading Test Agent",
    role:
      "Test Specialist",
    description:
      "Deterministic Tree 03.2 test worker.",
    capabilities,
    toolIds: [],
    status:
      "available",
  };
}

function contract(
  capabilityIds: string[],
): WorkUnitContract {
  const now =
    new Date().toISOString();

  return {
    id:
      "work-unit-capability-loading-test",
    role:
      "Test Specialist",
    objective:
      "Verify progressive capability loading.",
    capabilityIds,
    allowedToolIds: [],
    allowedPaths: [],
    budget: {
      maxTimeMs:
        1000,
      maxTokens:
        1000,
      maxIterations:
        2,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "Required capabilities are loaded.",
    ],
    requiredEvidenceTypes: [
      "test-result",
    ],
    approved:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function main(): void {
  const registry =
    new CapabilityRegistry();

  registry.register(
    capability(
      "capability-base",
    ),
  );

  registry.register(
    capability(
      "capability-build",
      [
        "capability-base",
      ],
    ),
  );

  registry.register(
    capability(
      "capability-research",
    ),
  );

  registry.register(
    capability(
      "capability-unused",
    ),
  );

  registry.register(
    capability(
      "capability-disabled",
      [],
      false,
    ),
  );

  registry.register(
    capability(
      "capability-dependent-disabled",
      [
        "capability-disabled",
      ],
    ),
  );

  const authority =
    new CapabilityLoadingAuthority(
      registry,
    );

  const exact =
    authority.load({
      requiredCapabilityIds: [
        "capability-build",
      ],
    });

  assert(
    exact.loadedCapabilityIds.join(
      ",",
    ) ===
      "capability-base,capability-build",
    "Progressive loading should include the requested capability and its dependencies only.",
  );

  assert(
    !exact.loadedCapabilityIds.includes(
      "capability-unused",
    ),
    "Progressive loading must not load unrelated capabilities.",
  );

  console.log(
    "03.2 progressive capability loading: SUCCESS",
  );

  const authorized =
    authority.load({
      requiredCapabilityIds: [
        "capability-build",
      ],
      agent:
        agent([
          "capability-base",
          "capability-build",
        ]),
      workUnitContract:
        contract([
          "capability-base",
          "capability-build",
        ]),
    });

  assert(
    authorized.rejected.length ===
      0,
    "Authorized capability loading should succeed.",
  );

  console.log(
    "03.2 worker capability authorization boundary: SUCCESS",
  );

  const missingWorkerCapability =
    authority.load({
      requiredCapabilityIds: [
        "capability-build",
      ],
      agent:
        agent([
          "capability-build",
        ]),
    });

  assert(
    missingWorkerCapability.rejected.length >
      0,
    "Worker capability mismatch must reject loading.",
  );

  console.log(
    "03.2 worker capability mismatch rejection: SUCCESS",
  );

  const missingContractCapability =
    authority.load({
      requiredCapabilityIds: [
        "capability-build",
      ],
      agent:
        agent([
          "capability-base",
          "capability-build",
        ]),
      workUnitContract:
        contract([
          "capability-build",
        ]),
    });

  assert(
    missingContractCapability.rejected.length >
      0,
    "Work Unit Contract must authorize every loaded dependency.",
  );

  console.log(
    "03.2 Work Unit Contract boundary: SUCCESS",
  );

  const disabled =
    authority.load({
      requiredCapabilityIds: [
        "capability-disabled",
      ],
    });

  assert(
    disabled.rejected.length ===
      1,
    "Disabled capabilities must be rejected.",
  );

  assert(
    disabled.loadedCapabilityIds.length ===
      0,
    "Disabled capabilities must never load.",
  );

  console.log(
    "03.2 disabled capability rejection: SUCCESS",
  );

  const dependentDisabled =
    authority.load({
      requiredCapabilityIds: [
        "capability-dependent-disabled",
      ],
    });

  assert(
    dependentDisabled.loadedCapabilityIds.length ===
      0,
    "Capabilities with unavailable dependencies must not load.",
  );

  assert(
    dependentDisabled.rejected.length >
      0,
    "Unavailable dependency must be preserved as a rejection.",
  );

  console.log(
    "03.2 dependency failure preservation: SUCCESS",
  );

  const deterministicA =
    authority.load({
      requiredCapabilityIds: [
        "capability-research",
        "capability-build",
      ],
    });

  const deterministicB =
    authority.load({
      requiredCapabilityIds: [
        "capability-research",
        "capability-build",
      ],
    });

  assert(
    deterministicA.loadedCapabilityIds.join(
      ",",
    ) ===
      deterministicB.loadedCapabilityIds.join(
        ",",
      ),
    "Capability loading must be deterministic.",
  );

  console.log(
    "03.2 deterministic capability loading: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    authority.load({
      requiredCapabilityIds: [
        "capability-build",
        "capability-build",
      ],
    });
  } catch {
    duplicateRejected =
      true;
  }

  assert(
    duplicateRejected,
    "Duplicate capability requests must be rejected.",
  );

  console.log(
    "03.2 duplicate capability request rejection: SUCCESS",
  );

  console.log(
    "03.2 capability loading preserves authorization boundary: SUCCESS",
  );

  console.log(
    "TREE-03.2 CAPABILITY LOADING: SUCCESS",
  );
}

main();
