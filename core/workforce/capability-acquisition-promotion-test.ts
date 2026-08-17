import type {
  CapabilityGapResolutionPlan,
} from "./capability-gap-resolution";

import {
  CapabilityRegistry,
} from "./capability-registry";

import {
  MemoryStore,
} from "./memory-store";

import {
  CapabilityAcquisitionAuthority,
} from "./capability-acquisition";

import {
  CapabilityAcquisitionExecutionAuthority,
} from "./capability-acquisition-execution";

import {
  CapabilityAcquisitionVerificationAuthority,
} from "./capability-acquisition-verification";

import {
  CapabilityAcquisitionPromotionAuthority,
} from "./capability-acquisition-promotion";

function assert(
  condition:
    unknown,
  message:
    string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const now =
    new Date().toISOString();

  const gapPlan:
    CapabilityGapResolutionPlan =
    {
      id:
        "gap-plan-promotion-test",
      projectId:
        "project-capability-promotion",
      gaps: [
        {
          id:
            "gap-typescript-build",
          projectId:
            "project-capability-promotion",
          language:
            "typescript",
          operation:
            "build",
          kind:
            "operation",
          resolved:
            true,
          verified:
            false,
        },
      ],
      ready:
        false,
    };

  const acquisition =
    new CapabilityAcquisitionAuthority();

  const initial =
    acquisition.createPlan({
      plan:
        gapPlan,
      budgetLimit:
        0,
    });

  const actionId =
    "acquisition-gap-typescript-build";

  const approved =
    acquisition.approve(
      initial,
      actionId,
    );

  const executionAuthority =
    new CapabilityAcquisitionExecutionAuthority();

  const running =
    executionAuthority.start(
      approved,
      actionId,
      now,
    );

  const succeeded =
    executionAuthority.succeed(
      running,
      "Verified TypeScript build capability from the local Node/TypeScript toolchain.",
      new Date().toISOString(),
    );

  const completedPlan =
    executionAuthority.completeAction(
      approved,
      succeeded,
    );

  const verificationAuthority =
    new CapabilityAcquisitionVerificationAuthority();

  const verified =
    verificationAuthority.verify(
      gapPlan,
      succeeded,
      {
        language:
          "typescript",
        toolchain:
          (() => {
            const registry =
              new (
                require(
                  "./engineering-toolchain",
                ).EngineeringToolchainRegistry
              )();

            const toolchains =
              require(
                "./engineering-toolchain",
              ).createDefaultEngineeringToolchains();

            for (
              const toolchain of
                toolchains
            ) {
              registry.register(
                toolchain,
              );
            }

            const resolved =
              registry.get(
                "typescript",
              );

            if (!resolved) {
              throw new Error(
                "TypeScript toolchain fixture could not be resolved",
              );
            }

            return resolved;
          })(),
        verified:
          true,
        availableExecutables: [
          "npx",
          "npm",
          "node",
        ],
        missingExecutables: [],
        unsupportedOperations: [],
      },
    );

  const resolvedGapPlan =
    verificationAuthority.apply(
      gapPlan,
      verified,
    );

  const registry =
    new CapabilityRegistry();

  const memory =
    new MemoryStore();

  const promotion =
    new CapabilityAcquisitionPromotionAuthority(
      registry,
      memory,
    );

  const result =
    promotion.promote({
      plan:
        completedPlan,
      actionId,
      execution:
        succeeded,
      verification:
        verified,
      capability: {
        id:
          "engineering-typescript-build",
        name:
          "TypeScript Build Engineering",
        description:
          "Build TypeScript projects using the verified local TypeScript toolchain.",
        dependencies: [],
        allowedToolIds: [
          "tool-execution-sandbox",
        ],
        allowedPaths: [
          "src",
        ],
        risk:
          "low",
        verificationRequirements: [
          "TypeScript build command exits successfully.",
        ],
        enabled:
          false,
        createdAt:
          now,
        updatedAt:
          now,
      },
      memory: {
        id:
          "memory-capability-typescript-build",
        type:
          "procedural",
        summary:
          "Verified procedure: build TypeScript projects with the local TypeScript toolchain.",
        authoritative:
          false,
        sourceReferences: [
          verified.id,
          succeeded.id,
        ],
        createdAt:
          now,
        updatedAt:
          now,
      },
    });

  assert(
    resolvedGapPlan.ready,
    "verified gap plan must become ready",
  );

  assert(
    result.promoted,
    "verified capability must be promoted",
  );

  assert(
    result.capability.enabled,
    "promoted capability must be enabled",
  );

  assert(
    registry.get(
      "engineering-typescript-build",
    ) !== undefined,
    "promoted capability must be registered",
  );

  const learned =
    memory.get(
      "memory-capability-typescript-build",
    );

  assert(
    learned?.authoritative ===
      true,
    "promoted learning must become authoritative",
  );

  assert(
    learned?.sourceReferences.length ===
      2,
    "promoted learning must preserve provenance",
  );

  console.log(
    "K.I.N.G.S. CAPABILITY ACQUISITION → APPROVAL: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. CAPABILITY ACQUISITION → VERIFIED PROMOTION: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. CAPABILITY ACQUISITION → PROCEDURAL MEMORY: SUCCESS",
  );

  console.log(
    "TREE-KCM-CAPABILITY-LEARNING: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      "TREE-KCM-CAPABILITY-LEARNING: FAILURE",
    );
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
