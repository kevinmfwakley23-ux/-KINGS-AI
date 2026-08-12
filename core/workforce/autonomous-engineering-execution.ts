import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "./engineering-toolchain";


export interface AutonomousEngineeringStep {
  id:
    ID;
  language:
    EngineeringLanguage;
  operation:
    ToolchainOperation;
}

export interface AutonomousEngineeringPlan {
  id:
    ID;
  projectId:
    ID;
  steps:
    AutonomousEngineeringStep[];
}

import type {
  ProjectEngineeringProfile,
} from "./project-engineering-profile";

import type {
  EngineeringWorkUnitPlan,
} from "./engineering-work-unit-bridge";

export type EngineeringExecutionStatus =
  | "ready"
  | "blocked"
  | "completed"
  | "failed";

export interface EngineeringExecutionStep {
  id:
    ID;
  language:
    EngineeringLanguage;
  operation:
    ToolchainOperation;
  capabilityId:
    ID;
  sequence:
    number;
}

export interface EngineeringExecutionResult {
  id:
    ID;
  projectId:
    ID;
  planId:
    ID;
  started:
    boolean;
}

export interface AutonomousEngineeringExecution {
  id:
    ID;
  projectId:
    ID;
  status:
    EngineeringExecutionStatus;
  steps:
    EngineeringExecutionStep[];
  currentStepId?:
    ID;
  completedStepIds:
    ID[];
  blockedReasons:
    string[];
}

export interface EngineeringExecutionRequest {
  id:
    ID;
  projectId:
    ID;
  profile:
    ProjectEngineeringProfile;
  plan:
    EngineeringWorkUnitPlan;
}

export class AutonomousEngineeringExecutionAuthority {
  plan(
    request:
      EngineeringExecutionRequest,
  ):
    AutonomousEngineeringExecution {
    if (
      request.plan.blocked
    ) {
      return {
        id:
          request.id,
        projectId:
          request.projectId,
        status:
          "blocked",
        steps: [],
        completedStepIds: [],
        blockedReasons: [
          ...request.plan.blockReasons,
        ],
      };
    }

    const steps:
      EngineeringExecutionStep[] = [];

    let sequence =
      1;

    for (
      const requirement of
        request.plan.requirements
    ) {
      const capabilityId =
        `engineering-${requirement.language}`;

      for (
        const operation of
          requirement.operations
      ) {
        steps.push({
          id:
            `${request.id}-step-${sequence}`,
          language:
            requirement.language,
          operation,
          capabilityId,
          sequence,
        });

        sequence +=
          1;
      }
    }

    return {
      id:
        request.id,
      projectId:
        request.projectId,
      status:
        steps.length > 0
          ? "ready"
          : "completed",
      steps,
      currentStepId:
        steps[0]?.id,
      completedStepIds: [],
      blockedReasons: [],
    };
  }

  completeStep(
    execution:
      AutonomousEngineeringExecution,
    stepId:
      ID,
  ):
    AutonomousEngineeringExecution {
    if (
      execution.status ===
      "blocked"
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Execution: blocked execution cannot advance",
      );
    }

    const step =
      execution.steps.find(
        (candidate) =>
          candidate.id ===
          stepId,
      );

    if (!step) {
      throw new Error(
        `K.I.N.G.S. Engineering Execution: step "${stepId}" was not found`,
      );
    }

    if (
      execution.completedStepIds.includes(
        stepId,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Execution: step "${stepId}" is already complete`,
      );
    }

    if (
      execution.currentStepId !==
      stepId
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Execution: steps must complete in governed sequence",
      );
    }

    const completed = [
      ...execution.completedStepIds,
      stepId,
    ];

    const next =
      execution.steps.find(
        (candidate) =>
          !completed.includes(
            candidate.id,
          ),
      );

    return {
      ...execution,
      status:
        next
          ? "ready"
          : "completed",
      currentStepId:
        next?.id,
      completedStepIds:
        completed,
      steps: [
        ...execution.steps,
      ],
      blockedReasons: [
        ...execution.blockedReasons,
      ],
    };
  }
}
