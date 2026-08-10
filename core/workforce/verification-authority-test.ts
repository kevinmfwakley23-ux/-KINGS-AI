import type {
  CompletionEvidence,
} from "./completion-gate";

import {
  EvidenceStore,
} from "./evidence-store";

import {
  VerificationAuthority,
  type EvidenceVerifier,
  type VerificationResult,
} from "./verification-authority";

function now(): string {
  return new Date().toISOString();
}

function evidence(
  id: string,
  type: string,
  criterion: string,
  reference: string,
  status: "passed" | "failed" = "passed",
): CompletionEvidence {
  return {
    id,
    type,
    criterion,
    status,
    summary:
      `Verification evidence for ${criterion}.`,
    verificationReference: reference,
    createdAt: now(),
  };
}

class DeterministicVerifier
  implements EvidenceVerifier
{
  readonly id =
    "deterministic-verifier";

  verify(
    item: CompletionEvidence,
  ): VerificationResult {
    if (
      item.verificationReference.startsWith(
        "verified/",
      )
    ) {
      return {
        evidenceId: item.id,
        verified: true,
        reasons: [],
      };
    }

    return {
      evidenceId: item.id,
      verified: false,
      reasons: [
        `Evidence "${item.id}" does not contain an accepted verification reference.`,
      ],
    };
  }
}

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function main(): void {
  const store =
    new EvidenceStore();

  const verifiedEvidence =
    evidence(
      "evidence-007-verified",
      "test",
      "Regression tests pass",
      "verified/regression-007",
    );

  const unverifiedEvidence =
    evidence(
      "evidence-007-unverified",
      "test",
      "Unverified test result",
      "unverified/regression-007",
    );

  const failedEvidence =
    evidence(
      "evidence-007-failed",
      "verification",
      "Verification failed",
      "verified/failure-007",
      "failed",
    );

  store.register(
    verifiedEvidence,
  );

  store.register(
    unverifiedEvidence,
  );

  store.register(
    failedEvidence,
  );

  const authority =
    new VerificationAuthority(
      store,
      [
        new DeterministicVerifier(),
      ],
    );

  const verified =
    authority.verifyEvidence(
      verifiedEvidence.id,
    );

  assert(
    verified.verified,
    "Valid verification evidence should pass verification.",
  );

  assert(
    verified.reasons.length === 0,
    "Verified evidence should have no failure reasons.",
  );

  const unverified =
    authority.verifyEvidence(
      unverifiedEvidence.id,
    );

  assert(
    !unverified.verified,
    "Unverified evidence should fail verification.",
  );

  assert(
    unverified.reasons.length > 0,
    "Unverified evidence should provide a reason.",
  );

  const missing =
    authority.verifyEvidence(
      "evidence-007-missing",
    );

  assert(
    !missing.verified,
    "Missing evidence should fail verification.",
  );

  const summary =
    authority.verifyAll();

  assert(
    !summary.verified,
    "Verification summary should fail when evidence is unverified.",
  );

  assert(
    summary.results.length === 3,
    "Verification summary should contain every requested evidence result.",
  );

  assert(
    summary.evidence.length === 1,
    "Only verified passing evidence should be promoted.",
  );

  assert(
    summary.evidence[0]?.id ===
      verifiedEvidence.id,
    "Verified evidence identity should be preserved.",
  );

  const cleanStore =
    new EvidenceStore();

  cleanStore.register(
    verifiedEvidence,
  );

  const cleanAuthority =
    new VerificationAuthority(
      cleanStore,
      [
        new DeterministicVerifier(),
      ],
    );

  const cleanSummary =
    cleanAuthority.verifyAll();

  assert(
    cleanSummary.verified,
    "A fully verified evidence set should pass.",
  );

  assert(
    cleanSummary.evidence.length === 1,
    "Fully verified evidence should be returned.",
  );

  console.log(
    "Verified evidence accepted: SUCCESS",
  );
  console.log(
    "Unverified evidence rejected: SUCCESS",
  );
  console.log(
    "Missing evidence rejected: SUCCESS",
  );
  console.log(
    "Verification failure propagated: SUCCESS",
  );
  console.log(
    "Only verified passing evidence promoted: SUCCESS",
  );
  console.log(
    "Fully verified evidence set accepted: SUCCESS",
  );
  console.log(
    "INTELLIGENCE-007 verification authority: SUCCESS",
  );
}

main();
