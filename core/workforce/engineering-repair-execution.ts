import type {
  ID,
} from "./types";

import type {
  EngineeringRepairPlan,
  EngineeringRepairStep,
} from "./engineering-repair-planner";

export type EngineeringRepairExecutionStatus =
  | "completed"
  | "failed"
  | "blocked";

export interface EngineeringRepairStepResult {
  id:
    ID;
  stepId:
    ID;
  strategy:
    EngineeringRepairStep["strategy"];
  status:
    "success"
    | "failed"
    | "blocked";
  output:
    string;
  completedAt:
    string;
}

export interface EngineeringRepairExecutionResult {
  id:
    ID;
  planId:
    ID;
  projectId:
    ID;
  status:
    EngineeringRepairExecutionStatus;
  stepResults:
    EngineeringRepairStepResult[];
  verified:
    boolean;
}

export interface EngineeringRepairStepExecutor {
  execute(
    step:
      EngineeringRepairStep,
  ):
    Promise<{
      success:
        boolean;
      output:
        string;
    }>;
}

export class EngineeringRepairExecutionAuthority {
  async execute(
    plan:
      EngineeringRepairPlan,
    executor:
      EngineeringRepairStepExecutor,
    completedAt:
      string,
  ):
    Promise<EngineeringRepairExecutionResult> {
    if (
      !plan.authorized
    ) {
      return {
        id:
          `repair-execution-${plan.id}`,
        planId:
          plan.id,
        projectId:
          plan.projectId,
        status:
          "blocked",
        stepResults: [],
        verified:
          false,
      };
    }

    const stepResults:
      EngineeringRepairStepResult[] =
      [];

    for (
      const step of
        plan.steps
    ) {
      const result =
        await executor.execute(
          step,
        );

      const stepResult:
        EngineeringRepairStepResult =
        {
          id:
            `repair-step-result-${step.id}`,
          stepId:
            step.id,
          strategy:
            step.strategy,
          status:
            result.success
              ? "success"
              : "failed",
          output:
            result.output,
          completedAt,
        };

      stepResults.push(
        stepResult,
      );

      if (
        !result.success
      ) {
        return {
          id:
            `repair-execution-${plan.id}`,
          planId:
            plan.id,
          projectId:
            plan.projectId,
          status:
            "failed",
          stepResults,
          verified:
            false,
        };
      }
    }

    const hasRetest =
      plan.steps.some(
        (step) =>
          step.strategy ===
          "retest",
      );

    return {
      id:
        `repair-execution-${plan.id}`,
      planId:
        plan.id,
      projectId:
        plan.projectId,
      status:
        "completed",
      stepResults,
      verified:
        hasRetest &&
        stepResults.every(
          (result) =>
            result.status ===
            "success",
        ),
    };
  }
}
