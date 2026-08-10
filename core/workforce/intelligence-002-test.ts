import {
  CapabilityRegistry,
  CapabilityManifest,
} from "./capability-registry";

import {
  WorkUnitContract,
  validateWorkUnitContract,
} from "./work-unit-contract";

import {
  CompletionEvidence,
  CompletionGate,
} from "./completion-gate";

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

function now(): string {
  return new Date().toISOString();
}

function main(): void {
  const registry =
    new CapabilityRegistry();

  const baseCapability:
    CapabilityManifest = {
      id: "capability-test-base",
      name: "Test Base Capability",
      description:
        "Base capability for deterministic registry testing.",
      dependencies: [],
      allowedToolIds: [
        "tool-test",
      ],
      allowedPaths: [
        "core/workforce",
      ],
      risk: "low",
      verificationRequirements: [
        "test",
      ],
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    };

  const buildCapability:
    CapabilityManifest = {
      id: "capability-test-build",
      name: "Test Build Capability",
      description:
        "Build capability depending on the base capability.",
      dependencies: [
        baseCapability.id,
      ],
      allowedToolIds: [
        "tool-test",
      ],
      allowedPaths: [
        "core/workforce",
      ],
      risk: "medium",
      verificationRequirements: [
        "typecheck",
        "test",
      ],
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    };

  registry.register(
    baseCapability,
  );
  registry.register(
    buildCapability,
  );

  assert(
    registry.get(
      buildCapability.id,
    ) !== undefined,
    "Capability registry should return registered capabilities.",
  );

  assert(
    registry.discover({
      requiredToolId:
        "tool-test",
      enabledOnly: true,
    }).length === 2,
    "Capability discovery should find enabled tool-compatible capabilities.",
  );

  assert(
    registry.validateDependencies(
      buildCapability.id,
    ).length === 0,
    "Registered capability dependencies should resolve.",
  );

  const missingDependencyCapability:
    CapabilityManifest = {
      id: "capability-test-missing",
      name: "Missing Dependency Capability",
      description:
        "Capability intentionally referencing a missing dependency.",
      dependencies: [
        "capability-does-not-exist",
      ],
      allowedToolIds: [],
      allowedPaths: [],
      risk: "high",
      verificationRequirements: [
        "review",
      ],
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    };

  registry.register(
    missingDependencyCapability,
  );

  assert(
    registry.validateDependencies(
      missingDependencyCapability.id,
    ).includes(
      "capability-does-not-exist",
    ),
    "Missing capability dependencies must be detected.",
  );

  console.log(
    "Capability registration: SUCCESS",
  );
  console.log(
    "Capability discovery: SUCCESS",
  );
  console.log(
    "Capability dependency validation: SUCCESS",
  );

  const contract:
    WorkUnitContract = {
    id: "work-unit-intelligence-002",
    role: "Controlled implementation worker",
    objective:
      "Implement and verify the next K.I.N.G.S. intelligence boundary.",
    capabilityIds: [
      buildCapability.id,
    ],
    allowedToolIds: [
      "tool-test",
    ],
    allowedPaths: [
      "core/workforce",
    ],
    budget: {
      maxTimeMs: 60_000,
      maxTokens: 10_000,
      maxIterations: 3,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "Capability registry is operational",
      "Work unit contract is valid",
    ],
    requiredEvidenceTypes: [
      "test",
      "typecheck",
    ],
    approved: true,
    createdAt: now(),
    updatedAt: now(),
  };

  const contractValidation =
    validateWorkUnitContract(
      contract,
    );

  assert(
    contractValidation.valid,
    `Work unit contract should validate: ${contractValidation.reasons.join("; ")}`,
  );

  console.log(
    "Work Unit Contract validation: SUCCESS",
  );

  const evidence:
    CompletionEvidence[] = [
      {
        id: "evidence-intelligence-002-test",
        type: "test",
        criterion:
          "Capability registry is operational",
        status: "passed",
        summary:
          "Capability registry registration, discovery, and dependency checks passed.",
        verificationReference:
          "intelligence-002-test",
        createdAt: now(),
      },
      {
        id: "evidence-intelligence-002-typecheck",
        type: "typecheck",
        criterion:
          "Work unit contract is valid",
        status: "passed",
        summary:
          "The Intelligence-002 implementation compiled successfully.",
        verificationReference:
          "typescript-compiler",
        createdAt: now(),
      },
    ];

  const gate =
    new CompletionGate();

  const decision =
    gate.evaluate(
      "task-intelligence-002",
      contract,
      evidence,
    );

  assert(
    decision.passed,
    `Completion gate should pass: ${decision.reasons.join("; ")}`,
  );

  console.log(
    "Completion evidence verification: SUCCESS",
  );
  console.log(
    "Completion Gate: SUCCESS",
  );
  console.log(
    "INTELLIGENCE-002 capability + contract + completion authority: SUCCESS",
  );
}

main();
