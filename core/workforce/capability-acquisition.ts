import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  CapabilityGap,
  CapabilityGapResolutionPlan,
} from "./capability-gap-resolution";

export type CapabilityAcquisitionStrategy =
  | "existing-runtime"
  | "local-install"
  | "build-capability"
  | "external-provider";

export interface CapabilityAcquisitionAction {
  id:
    ID;
  gapId:
    ID;
  projectId:
    ID;
  strategy:
    CapabilityAcquisitionStrategy;
  language?:
    EngineeringLanguage;
  operation?:
    ToolchainOperation;
  estimatedCost:
    number;
  requiresExternalProvider:
    boolean;
  approved:
    boolean;
  completed:
    boolean;
}

export interface CapabilityAcquisitionPlan {
  id:
    ID;
  projectId:
    ID;
  actions:
    CapabilityAcquisitionAction[];
  budgetLimit:
    number;
  withinBudget:
    boolean;
  ready:
    boolean;
}

export interface CapabilityAcquisitionRequest {
  plan:
    CapabilityGapResolutionPlan;
  budgetLimit:
    number;
}

export class CapabilityAcquisitionAuthority {
  createPlan(
    request:
      CapabilityAcquisitionRequest,
  ):
    CapabilityAcquisitionPlan {
    const actions:
      CapabilityAcquisitionAction[] =
      request.plan.gaps.map(
        (gap) => ({
          id:
            `acquisition-${gap.id}`,
          gapId:
            gap.id,
          projectId:
            gap.projectId,
          strategy:
            "build-capability",
          language:
            gap.language,
          operation:
            gap.operation,
          estimatedCost:
            0,
          requiresExternalProvider:
            false,
          approved:
            false,
          completed:
            false,
        }),
      );

    return {
      id:
        `acquisition-plan-${request.plan.projectId}`,
      projectId:
        request.plan.projectId,
      actions,
      budgetLimit:
        request.budgetLimit,
      withinBudget:
        actions.every(
          (action) =>
            action.estimatedCost <=
            request.budgetLimit,
        ),
      ready:
        actions.length ===
        0,
    };
  }

  approve(
    plan:
      CapabilityAcquisitionPlan,
    actionId:
      ID,
  ):
    CapabilityAcquisitionPlan {
    const action =
      plan.actions.find(
        (candidate) =>
          candidate.id ===
          actionId,
      );

    if (!action) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition: action "${actionId}" was not found`,
      );
    }

    if (
      action.estimatedCost >
      plan.budgetLimit
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition: action "${actionId}" exceeds the approved budget`,
      );
    }

    if (
      action.requiresExternalProvider &&
      action.estimatedCost >
        0
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Acquisition: paid external dependency requires explicit approval",
      );
    }

    return {
      ...plan,
      actions:
        plan.actions.map(
          (candidate) =>
            candidate.id ===
              actionId
              ? {
                  ...candidate,
                  approved:
                    true,
                }
              : candidate,
        ),
    };
  }

  complete(
    plan:
      CapabilityAcquisitionPlan,
    actionId:
      ID,
  ):
    CapabilityAcquisitionPlan {
    const action =
      plan.actions.find(
        (candidate) =>
          candidate.id ===
          actionId,
      );

    if (!action) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition: action "${actionId}" was not found`,
      );
    }

    if (!action.approved) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition: action "${actionId}" cannot complete before approval`,
      );
    }

    return {
      ...plan,
      actions:
        plan.actions.map(
          (candidate) =>
            candidate.id ===
              actionId
              ? {
                  ...candidate,
                  completed:
                    true,
                }
              : candidate,
        ),
      ready:
        plan.actions.every(
          (candidate) =>
            candidate.id ===
              actionId
              ? true
              : candidate.completed,
        ),
    };
  }
}
