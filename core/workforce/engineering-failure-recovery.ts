import type {
  ID,
} from "./types";

import type {
  EngineeringCommandResult,
} from "./engineering-execution-loop";

export type EngineeringRecoveryAction =
  | "retry"
  | "repair"
  | "blocked"
  | "escalate"
  | "complete";

export interface EngineeringFailureAnalysis {
  id:
    ID;
  commandResultId:
    ID;
  projectId:
    ID;
  action:
    EngineeringRecoveryAction;
  retryable:
    boolean;
  reason:
    string;
  diagnostics:
    string[];
}

export interface EngineeringFailureRecoveryPolicy {
  maxRetries:
    number;
  allowRepair:
    boolean;
}

export class EngineeringFailureRecoveryAuthority {
  analyze(
    result:
      EngineeringCommandResult,
    attemptNumber:
      number,
    policy:
      EngineeringFailureRecoveryPolicy,
  ):
    EngineeringFailureAnalysis {
    if (
      result.status ===
      "success"
    ) {
      return {
        id:
          `analysis-${result.id}`,
        commandResultId:
          result.id,
        projectId:
          result.projectId,
        action:
          "complete",
        retryable:
          false,
        reason:
          "Engineering command completed successfully.",
        diagnostics: [
          result.stdout,
        ].filter(
          Boolean,
        ),
      };
    }

    if (
      result.status ===
      "blocked"
    ) {
      return {
        id:
          `analysis-${result.id}`,
        commandResultId:
          result.id,
        projectId:
          result.projectId,
        action:
          "blocked",
        retryable:
          false,
        reason:
          "Engineering command was blocked by an authorization boundary.",
        diagnostics: [
          result.stderr,
        ].filter(
          Boolean,
        ),
      };
    }

    const diagnostics =
      [
        result.stderr,
        result.stdout,
      ].filter(
        Boolean,
      );

    if (
      attemptNumber <
        policy.maxRetries
    ) {
      return {
        id:
          `analysis-${result.id}`,
        commandResultId:
          result.id,
        projectId:
          result.projectId,
        action:
          "retry",
        retryable:
          true,
        reason:
          "Engineering command failed and remains within the retry policy.",
        diagnostics,
      };
    }

    if (
      policy.allowRepair
    ) {
      return {
        id:
          `analysis-${result.id}`,
        commandResultId:
          result.id,
        projectId:
          result.projectId,
        action:
          "repair",
        retryable:
          false,
        reason:
          "Retry limit reached; engineering repair is authorized.",
        diagnostics,
      };
    }

    return {
      id:
        `analysis-${result.id}`,
      commandResultId:
        result.id,
      projectId:
        result.projectId,
      action:
        "escalate",
      retryable:
        false,
      reason:
        "Engineering command failed and automated recovery is exhausted.",
      diagnostics,
    };
  }
}
