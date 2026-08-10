import type {
  ID,
} from "./types";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

export type CompletionEvidenceStatus =
  | "passed"
  | "failed";

export interface CompletionEvidence {
  id: ID;

  /**
   * Evidence category, such as test, typecheck,
   * build, verification, review, or artifact.
   */
  type: string;

  /**
   * Acceptance criterion established by this evidence.
   */
  criterion: string;

  status: CompletionEvidenceStatus;

  summary: string;

  /**
   * Reference to the deterministic verification source.
   */
  verificationReference: string;

  createdAt: string;
}

export interface CompletionDecision {
  taskId: ID;
  passed: boolean;
  reasons: string[];
  evidenceIds: ID[];
}

export class CompletionGate {
  evaluate(
    taskId: ID,
    contract: WorkUnitContract,
    evidence: CompletionEvidence[],
  ): CompletionDecision {
    const reasons: string[] = [];

    if (!contract.approved) {
      reasons.push(
        "Work unit contract is not approved.",
      );
    }

    const failedEvidence =
      evidence.filter(
        (item) =>
          item.status === "failed",
      );

    if (
      failedEvidence.length > 0
    ) {
      reasons.push(
        `Completion evidence contains ${failedEvidence.length} failed verification result(s).`,
      );
    }

    const passedEvidence =
      evidence.filter(
        (item) =>
          item.status === "passed",
      );

    for (
      const requiredType of
      contract.requiredEvidenceTypes
    ) {
      const found =
        passedEvidence.some(
          (item) =>
            item.type === requiredType,
        );

      if (!found) {
        reasons.push(
          `Required evidence type "${requiredType}" is missing.`,
        );
      }
    }

    for (
      const criterion of
      contract.acceptanceCriteria
    ) {
      const satisfied =
        passedEvidence.some(
          (item) =>
            item.criterion ===
            criterion,
        );

      if (!satisfied) {
        reasons.push(
          `Acceptance criterion "${criterion}" lacks passing evidence.`,
        );
      }
    }

    const evidenceWithoutReference =
      passedEvidence.filter(
        (item) =>
          !item.verificationReference.trim(),
      );

    if (
      evidenceWithoutReference.length > 0
    ) {
      reasons.push(
        "Passing completion evidence must contain verification references.",
      );
    }

    return {
      taskId,
      passed:
        reasons.length === 0,
      reasons,
      evidenceIds:
        evidence.map(
          (item) => item.id,
        ),
    };
  }
}
