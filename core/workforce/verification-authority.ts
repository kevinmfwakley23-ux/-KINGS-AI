import type {
  ID,
} from "./types";

import type {
  CompletionEvidence,
} from "./completion-gate";

import type {
  EvidenceStore,
} from "./evidence-store";

export interface VerificationResult {
  evidenceId: ID;
  verified: boolean;
  reasons: string[];
}

export interface VerificationSummary {
  verified: boolean;
  evidence: CompletionEvidence[];
  results: VerificationResult[];
  reasons: string[];
}

export interface EvidenceVerifier {
  readonly id: string;

  verify(
    evidence: CompletionEvidence,
  ): VerificationResult;
}

export class VerificationAuthority {
  constructor(
    private readonly evidenceStore: EvidenceStore,
    private readonly verifiers: EvidenceVerifier[] = [],
  ) {}

  verifyEvidence(
    evidenceId: ID,
  ): VerificationResult {
    const evidence =
      this.evidenceStore.get(
        evidenceId,
      );

    if (!evidence) {
      return {
        evidenceId,
        verified: false,
        reasons: [
          `Evidence "${evidenceId}" was not found.`,
        ],
      };
    }

    if (
      !evidence.verificationReference.trim()
    ) {
      return {
        evidenceId,
        verified: false,
        reasons: [
          "Evidence has no verification reference.",
        ],
      };
    }

    if (this.verifiers.length === 0) {
      return {
        evidenceId,
        verified: true,
        reasons: [],
      };
    }

    const results =
      this.verifiers.map(
        (verifier) =>
          verifier.verify(evidence),
      );

    const failures =
      results.filter(
        (result) =>
          !result.verified,
      );

    if (failures.length > 0) {
      return {
        evidenceId,
        verified: false,
        reasons: failures.flatMap(
          (result) =>
            result.reasons,
        ),
      };
    }

    return {
      evidenceId,
      verified: true,
      reasons: [],
    };
  }

  verifyAll(
    evidenceIds?: ID[],
  ): VerificationSummary {
    const ids =
      evidenceIds ??
      this.evidenceStore
        .list()
        .map(
          (item) => item.id,
        );

    const results =
      ids.map(
        (evidenceId) =>
          this.verifyEvidence(
            evidenceId,
          ),
      );

    const failedResults =
      results.filter(
        (result) =>
          !result.verified,
      );

    const verifiedIds =
      new Set(
        results
          .filter(
            (result) =>
              result.verified,
          )
          .map(
            (result) =>
              result.evidenceId,
          ),
      );

    const evidence =
      this.evidenceStore
        .list()
        .filter(
          (item) =>
            verifiedIds.has(item.id) &&
            item.status === "passed",
        );

    return {
      verified:
        failedResults.length === 0,
      evidence,
      results,
      reasons:
        failedResults.flatMap(
          (result) =>
            result.reasons,
        ),
    };
  }
}
