import type {
  ID,
} from "./types";

import type {
  EngineeringVerificationGateResult,
} from "./engineering-verification-gate";

export interface EngineeringCompletionRequest {
  projectId:
    ID;
  taskId:
    ID;
  verification:
    EngineeringVerificationGateResult;
  requiredCriteria:
    string[];
}

export interface EngineeringCompletionResult {
  id:
    ID;
  projectId:
    ID;
  taskId:
    ID;
  completed:
    boolean;
  reason:
    string;
  verificationId:
    ID;
  unmetCriteria:
    string[];
}

export class EngineeringCompletionAuthority {
  complete(
    request:
      EngineeringCompletionRequest,
  ):
    EngineeringCompletionResult {
    const unmetCriteria =
      request.requiredCriteria.filter(
        (criterion) =>
          request.verification.evidence.find(
            (evidence) =>
              evidence.criterion ===
                criterion &&
              evidence.passed,
          ) === undefined,
      );

    const completed =
      request.verification.accepted &&
      unmetCriteria.length ===
        0;

    return {
      id:
        `completion-${request.taskId}`,
      projectId:
        request.projectId,
      taskId:
        request.taskId,
      completed,
      reason:
        completed
          ? "All required engineering criteria have verified evidence."
          : "Engineering work cannot be completed until every required criterion is verified.",
      verificationId:
        request.verification.id,
      unmetCriteria,
    };
  }
}
