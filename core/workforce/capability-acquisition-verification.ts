import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  CapabilityAcquisitionExecution,
} from "./capability-acquisition-execution";

import type {
  CapabilityGapResolutionPlan,
} from "./capability-gap-resolution";

import type {
  ToolchainVerificationResult,
} from "./toolchain-verification";

export interface CapabilityVerificationBridgeResult {
  id:
    ID;
  projectId:
    ID;
  gapId:
    ID;
  language?:
    EngineeringLanguage;
  operation?:
    ToolchainOperation;
  acquisitionExecutionId:
    ID;
  verified:
    boolean;
  evidence:
    string;
}

export class CapabilityAcquisitionVerificationAuthority {
  verify(
    plan:
      CapabilityGapResolutionPlan,
    execution:
      CapabilityAcquisitionExecution,
    verification:
      ToolchainVerificationResult,
  ):
    CapabilityVerificationBridgeResult {
    if (
      execution.status !==
      "succeeded"
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Verification: acquisition execution "${execution.id}" has not succeeded`,
      );
    }

    if (
      !execution.evidence?.trim()
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Verification: acquisition execution "${execution.id}" has no evidence`,
      );
    }

    const gap =
      plan.gaps.find(
        (candidate) =>
          candidate.id ===
          execution.actionId.replace(
            "acquisition-",
            "",
          ),
      );

    if (!gap) {
      throw new Error(
        `K.I.N.G.S. Capability Verification: no capability gap matches execution "${execution.id}"`,
      );
    }

    if (
      verification.language !==
      gap.language &&
      gap.language !==
        undefined
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Verification: verified language does not match the capability gap",
      );
    }

    if (
      gap.operation !==
        undefined &&
      verification.unsupportedOperations.includes(
        gap.operation,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Verification: required operation "${gap.operation}" remains unsupported`,
      );
    }

    if (
      !verification.verified
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Verification: toolchain verification for "${verification.language}" failed`,
      );
    }

    return {
      id:
        `capability-verification-${gap.id}`,
      projectId:
        gap.projectId,
      gapId:
        gap.id,
      language:
        gap.language,
      operation:
        gap.operation,
      acquisitionExecutionId:
        execution.id,
      verified:
        true,
      evidence:
        execution.evidence,
    };
  }

  apply(
    plan:
      CapabilityGapResolutionPlan,
    result:
      CapabilityVerificationBridgeResult,
  ):
    CapabilityGapResolutionPlan {
    if (
      !result.verified
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Verification: result "${result.id}" is not verified`,
      );
    }

    const gap =
      plan.gaps.find(
        (candidate) =>
          candidate.id ===
          result.gapId,
      );

    if (!gap) {
      throw new Error(
        `K.I.N.G.S. Capability Verification: gap "${result.gapId}" was not found`,
      );
    }

    if (
      !gap.resolved
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Verification: gap "${gap.id}" must be resolved before verification is applied`,
      );
    }

    return {
      ...plan,
      gaps:
        plan.gaps.map(
          (candidate) =>
            candidate.id ===
              result.gapId
              ? {
                  ...candidate,
                  verified:
                    true,
                }
              : candidate,
        ),
      ready:
        plan.gaps.every(
          (candidate) =>
            candidate.id ===
              result.gapId
              ? true
              : candidate.verified,
        ),
    };
  }
}
