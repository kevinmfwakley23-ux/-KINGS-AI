import type {
  ID,
} from "./types";

import type {
  EngineeringFailureAnalysis,
} from "./engineering-failure-recovery";

export type EngineeringRepairStrategy =
  | "inspect"
  | "edit"
  | "retest"
  | "rollback"
  | "escalate";

export interface EngineeringRepairStep {
  id:
    ID;
  strategy:
    EngineeringRepairStrategy;
  description:
    string;
  reason:
    string;
  required:
    boolean;
}

export interface EngineeringRepairPlan {
  id:
    ID;
  projectId:
    ID;
  failureAnalysisId:
    ID;
  authorized:
    boolean;
  steps:
    EngineeringRepairStep[];
  stopAfterFailure:
    boolean;
}

export class EngineeringRepairPlannerAuthority {
  plan(
    analysis:
      EngineeringFailureAnalysis,
  ):
    EngineeringRepairPlan {
    if (
      analysis.action ===
      "complete"
    ) {
      return {
        id:
          `repair-plan-${analysis.id}`,
        projectId:
          analysis.projectId,
        failureAnalysisId:
          analysis.id,
        authorized:
          false,
        steps: [],
        stopAfterFailure:
          true,
      };
    }

    if (
      analysis.action ===
      "blocked"
    ) {
      return {
        id:
          `repair-plan-${analysis.id}`,
        projectId:
          analysis.projectId,
        failureAnalysisId:
          analysis.id,
        authorized:
          false,
        steps: [
          {
            id:
              `repair-step-${analysis.id}-escalate`,
            strategy:
              "escalate",
            description:
              "Escalate the blocked engineering operation for explicit authorization.",
            reason:
              analysis.reason,
            required:
              true,
          },
        ],
        stopAfterFailure:
          true,
      };
    }

    if (
      analysis.action ===
      "retry"
    ) {
      return {
        id:
          `repair-plan-${analysis.id}`,
        projectId:
          analysis.projectId,
        failureAnalysisId:
          analysis.id,
        authorized:
          true,
        steps: [
          {
            id:
              `repair-step-${analysis.id}-inspect`,
            strategy:
              "inspect",
            description:
              "Inspect the captured failure diagnostics before retrying.",
            reason:
              "A retry must be informed by the recorded failure.",
            required:
              true,
          },
          {
            id:
              `repair-step-${analysis.id}-retest`,
            strategy:
              "retest",
            description:
              "Re-run the governed engineering verification.",
            reason:
              "The failure remains within the retry policy.",
            required:
              true,
          },
        ],
        stopAfterFailure:
          true,
      };
    }

    if (
      analysis.action ===
      "repair"
    ) {
      return {
        id:
          `repair-plan-${analysis.id}`,
        projectId:
          analysis.projectId,
        failureAnalysisId:
          analysis.id,
        authorized:
          true,
        steps: [
          {
            id:
              `repair-step-${analysis.id}-inspect`,
            strategy:
              "inspect",
            description:
              "Inspect the failure diagnostics and affected engineering boundary.",
            reason:
              "Repair must begin from verified evidence.",
            required:
              true,
          },
          {
            id:
              `repair-step-${analysis.id}-edit`,
            strategy:
              "edit",
            description:
              "Apply the smallest governed code change necessary to address the verified failure.",
            reason:
              "Automated repair is authorized by the recovery policy.",
            required:
              true,
          },
          {
            id:
              `repair-step-${analysis.id}-retest`,
            strategy:
              "retest",
            description:
              "Re-run the affected verification after the repair.",
            reason:
              "A repair is not complete until verification succeeds.",
            required:
              true,
          },
        ],
        stopAfterFailure:
          true,
      };
    }

    return {
      id:
        `repair-plan-${analysis.id}`,
      projectId:
        analysis.projectId,
      failureAnalysisId:
        analysis.id,
      authorized:
        false,
      steps: [
        {
          id:
            `repair-step-${analysis.id}-escalate`,
          strategy:
            "escalate",
          description:
            "Escalate the failure for explicit intervention.",
          reason:
            analysis.reason,
          required:
            true,
        },
      ],
      stopAfterFailure:
        true,
    };
  }
}
