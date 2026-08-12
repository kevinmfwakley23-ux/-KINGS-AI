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
              request.projectId,
        );

      const repairEvidence =
        request.repairResults.find(
          (result) =>
            result.projectId ===
              request.projectId &&
            result.verified,
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
            `Verified by successful engineering command ${commandEvidence.id}.`,
        });

        continue;
      }

      if (
        repairEvidence
      ) {
        evidence.push({
          id:
            `verification-${request.projectId}-${evidence.length + 1}`,
          projectId:
            request.projectId,
          source:
            "repair",
          referenceId:
            repairEvidence.id,
          criterion,
          passed:
            true,
          summary:
            `Verified by successful repair execution ${repairEvidence.id}.`,
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
          "No successful verification evidence was found.",
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
