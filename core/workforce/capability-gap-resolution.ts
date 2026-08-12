import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  ProjectCapabilityAudit,
} from "./project-capability-auditor";

export type CapabilityGapKind =
  | "language"
  | "operation";

export interface CapabilityGap {
  id:
    ID;
  projectId:
    ID;
  kind:
    CapabilityGapKind;
  language?:
    EngineeringLanguage;
  operation?:
    ToolchainOperation;
  resolved:
    boolean;
  verified:
    boolean;
}

export interface CapabilityGapResolutionPlan {
  id:
    ID;
  projectId:
    ID;
  gaps:
    CapabilityGap[];
  ready:
    boolean;
}

export class CapabilityGapResolutionAuthority {
  createPlan(
    audit:
      ProjectCapabilityAudit,
  ):
    CapabilityGapResolutionPlan {
    const gaps:
      CapabilityGap[] = [];

    for (
      const language of
      audit.missingLanguages
    ) {
      gaps.push({
        id:
          `gap-${audit.projectId}-language-${language}`,
        projectId:
          audit.projectId,
        kind:
          "language",
        language,
        resolved:
          false,
        verified:
          false,
      });
    }

    for (
      const operation of
      audit.missingOperations
    ) {
      gaps.push({
        id:
          `gap-${audit.projectId}-operation-${operation}`,
        projectId:
          audit.projectId,
        kind:
          "operation",
        operation,
        resolved:
          false,
        verified:
          false,
      });
    }

    return {
      id:
        `gap-plan-${audit.projectId}`,
      projectId:
        audit.projectId,
      gaps,
      ready:
        gaps.length ===
        0,
    };
  }

  resolve(
    plan:
      CapabilityGapResolutionPlan,
    gapId:
      ID,
  ):
    CapabilityGapResolutionPlan {
    const gap =
      plan.gaps.find(
        (candidate) =>
          candidate.id ===
          gapId,
      );

    if (!gap) {
      throw new Error(
        `K.I.N.G.S. Capability Gap: gap "${gapId}" was not found`,
      );
    }

    if (
      gap.verified
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Gap: verified gap "${gapId}" cannot be resolved again`,
      );
    }

    return {
      ...plan,
      gaps:
        plan.gaps.map(
          (candidate) =>
            candidate.id ===
              gapId
              ? {
                  ...candidate,
                  resolved:
                    true,
                }
              : candidate,
        ),
      ready:
        false,
    };
  }

  verify(
    plan:
      CapabilityGapResolutionPlan,
    gapId:
      ID,
  ):
    CapabilityGapResolutionPlan {
    const gap =
      plan.gaps.find(
        (candidate) =>
          candidate.id ===
          gapId,
      );

    if (!gap) {
      throw new Error(
        `K.I.N.G.S. Capability Gap: gap "${gapId}" was not found`,
      );
    }

    if (
      !gap.resolved
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Gap: gap "${gapId}" cannot be verified before resolution`,
      );
    }

    return {
      ...plan,
      gaps:
        plan.gaps.map(
          (candidate) =>
            candidate.id ===
              gapId
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
              gapId
              ? true
              : candidate.verified,
        ),
    };
  }
}
