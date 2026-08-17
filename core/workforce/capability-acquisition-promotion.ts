import type {
  ID,
  MemoryReference,
} from "./types";

import type {
  CapabilityAcquisitionAction,
  CapabilityAcquisitionPlan,
} from "./capability-acquisition";

import type {
  CapabilityAcquisitionExecution,
} from "./capability-acquisition-execution";

import type {
  CapabilityVerificationBridgeResult,
} from "./capability-acquisition-verification";

import {
  CapabilityRegistry,
  type CapabilityManifest,
} from "./capability-registry";

import {
  MemoryStore,
} from "./memory-store";

export interface CapabilityAcquisitionPromotionRequest {
  plan:
    CapabilityAcquisitionPlan;

  actionId:
    ID;

  execution:
    CapabilityAcquisitionExecution;

  verification:
    CapabilityVerificationBridgeResult;

  capability:
    CapabilityManifest;

  memory:
    MemoryReference;
}

export interface CapabilityAcquisitionPromotionResult {
  action:
    CapabilityAcquisitionAction;

  capability:
    CapabilityManifest;

  memory:
    MemoryReference;

  promoted:
    boolean;
}

export class CapabilityAcquisitionPromotionAuthority {
  constructor(
    private readonly registry:
      CapabilityRegistry,
    private readonly memory:
      MemoryStore,
  ) {}

  promote(
    request:
      CapabilityAcquisitionPromotionRequest,
  ):
    CapabilityAcquisitionPromotionResult {
    const action =
      request.plan.actions.find(
        (candidate) =>
          candidate.id ===
          request.actionId,
      );

    if (!action) {
      throw new Error(
        `K.I.N.G.S. Capability Promotion: action "${request.actionId}" was not found`,
      );
    }

    if (!action.approved) {
      throw new Error(
        `K.I.N.G.S. Capability Promotion: action "${request.actionId}" is not approved`,
      );
    }

    if (!action.completed) {
      throw new Error(
        `K.I.N.G.S. Capability Promotion: action "${request.actionId}" is not completed`,
      );
    }

    if (
      request.execution.status !==
      "succeeded"
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Promotion: acquisition execution "${request.execution.id}" did not succeed`,
      );
    }

    if (
      !request.verification.verified
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Promotion: verification "${request.verification.id}" is not verified`,
      );
    }

    if (
      request.verification.gapId !==
      action.gapId
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Promotion: verification does not match acquisition gap",
      );
    }

    if (
      request.capability.verificationRequirements.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Promotion: capability requires verification requirements",
      );
    }

    if (
      request.memory.sourceReferences.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Promotion: learned capability memory requires provenance",
      );
    }

    const existing =
      this.registry.get(
        request.capability.id,
      );

    if (existing) {
      throw new Error(
        `K.I.N.G.S. Capability Promotion: capability "${request.capability.id}" is already registered`,
      );
    }

    this.registry.register({
      ...request.capability,
      enabled:
        true,
      createdAt:
        request.capability.createdAt,
      updatedAt:
        new Date().toISOString(),
    });

    this.memory.register({
      ...request.memory,
      authoritative:
        true,
      updatedAt:
        new Date().toISOString(),
    });

    return {
      action: {
        ...action,
        completed:
          true,
      },
      capability:
        this.registry.get(
          request.capability.id,
        )!,
      memory:
        this.memory.get(
          request.memory.id,
        )!,
      promoted:
        true,
    };
  }
}
