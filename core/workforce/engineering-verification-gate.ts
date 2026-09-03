import type {
  ID,
} from "./types";

import type {
  EngineeringCommandResult,
} from "./engineering-execution-loop";

import type {
  EngineeringRepairExecutionResult,
} from "./engineering-repair-execution";

export interface EngineeringVerificationEvidence {
  id:
    ID;
  projectId:
    ID;
  source:
    "command"
    | "repair";
  referenceId:
    ID;
  criterion:
    string;
  passed:
    boolean;
  summary:
    string;
}

export interface EngineeringVerificationGateResult {
  id:
    ID;
  projectId:
    ID;
  accepted:
    boolean;
  evidence:
    EngineeringVerificationEvidence[];
  unmetCriteria:
    string[];
}

export interface EngineeringVerificationRequest {
  projectId:
    ID;
  requiredCriteria:
    string[];
  commandResults:
    EngineeringCommandResult[];
  repairResults:
    EngineeringRepairExecutionResult[];
}

export class EngineeringVerificationGateAuthority {
  verify(
    request:
      EngineeringVerificationRequest,
  ):
    EngineeringVerificationGateResult {
    const evidence:
      EngineeringVerificationEvidence[] =
      [];

    const unmetCriteria:
      string[] =
      [];

    for (
      const criterion of
        request.requiredCriteria
    ) {
      const commandEvidence =
        request.commandResults.find(
          (result) =>
            result.status ===
              "success" &&
            result.projectId ===
              request.projectId &&
            result.verifiesCriteria?.includes(
              criterion,
            ) === true,
        );

      if (
        commandEvidence
      ) {
        evidence.push({
          id:
            `verification-${request.projectId}-${evidence.length + 1}`,
          projectId:
            request.projectId,
          source:
            "command",
          referenceId:
            commandEvidence.id,
          criterion,
          passed:
            true,
          summary:
            `Verified by successful engineering command ${commandEvidence.id} explicitly bound to this criterion.`,
        });

        continue;
      }

      unmetCriteria.push(
        criterion,
      );

      evidence.push({
        id:
          `verification-${request.projectId}-${evidence.length + 1}`,
        projectId:
          request.projectId,
        source:
          "command",
        referenceId:
          `unverified-${request.projectId}`,
        criterion,
        passed:
          false,
        summary:
          request.repairResults.some(
            (result) =>
              result.projectId === request.projectId &&
              result.verified,
          )
            ? "A repair completed, but no post-repair command explicitly verified this acceptance criterion."
            : "No successful command explicitly verified this acceptance criterion.",
      });
    }

    return {
      id:
        `verification-gate-${request.projectId}`,
      projectId:
        request.projectId,
      accepted:
        unmetCriteria.length ===
        0,
      evidence,
      unmetCriteria,
    };
  }
}
