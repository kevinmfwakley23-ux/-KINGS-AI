import {
  EvidenceStore,
} from "./evidence-store";

import {
  VerificationAuthority,
} from "./verification-authority";

import {
  EvidenceReviewAuthority,
} from "./evidence-review-authority";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function contract(
  approved:
    boolean,
) {
  const now =
    new Date().toISOString();

  return {
    id:
      "WORK-UNIT-tree-07",
    role:
      "Evidence review worker",
    objective:
      "Review evidence for task completion.",
    capabilityIds: [
      "verification",
    ],
    allowedToolIds: [],
    allowedPaths: [],
    budget: {
      maxTimeMs:
        10_000,
      maxTokens:
        2_000,
      maxIterations:
        1,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "All required evidence passes.",
    ],
    requiredEvidenceTypes: [
      "test",
    ],
    approved,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

async function main(): Promise<void> {
  const store =
    new EvidenceStore();

  store.register({
    id:
      "evidence-tree-07-pass",
    type:
      "test",
    criterion:
      "All required evidence passes.",
    status:
      "passed",
    summary:
      "Tree 07 review fixture passed.",
    verificationReference:
      "test:tree-07",
    createdAt:
      new Date().toISOString(),
  });

  const authority =
    new EvidenceReviewAuthority(
      store,
      new VerificationAuthority(
        store,
      ),
    );

  const accepted =
    authority.review({
      taskId:
        "task-tree-07",
      contract:
        contract(true),
      evidenceIds: [
        "evidence-tree-07-pass",
      ],
    });

  assert(
    accepted.accepted,
    "Passing verified evidence must be accepted.",
  );

  assert(
    accepted.verification.verified,
    "All accepted evidence must be verified.",
  );

  assert(
    accepted.completion.passed,
    "All accepted evidence must satisfy the completion gate.",
  );

  store.register({
    id:
      "evidence-tree-07-fail",
    type:
      "test",
    criterion:
      "All required evidence passes.",
    status:
      "failed",
    summary:
      "Tree 07 review fixture failed.",
    verificationReference:
      "test:tree-07-fail",
    createdAt:
      new Date().toISOString(),
  });

  const rejected =
    authority.review({
      taskId:
        "task-tree-07",
      contract:
        contract(true),
      evidenceIds: [
        "evidence-tree-07-fail",
      ],
    });

  assert(
    !rejected.accepted,
    "Failed evidence must never be accepted.",
  );

  assert(
    rejected.reasons.some(
      (reason) =>
        reason.includes(
          "missing",
        ) ||
        reason.includes(
          "failed",
        ),
    ),
    "Rejected evidence review must preserve actionable rejection reasons.",
  );

  const unapproved =
    authority.review({
      taskId:
        "task-tree-07",
      contract:
        contract(false),
      evidenceIds: [
        "evidence-tree-07-pass",
      ],
    });

  assert(
    !unapproved.accepted,
    "Unapproved work units must never be accepted.",
  );

  const missing =
    authority.review({
      taskId:
        "task-tree-07",
      contract:
        contract(true),
      evidenceIds: [
        "missing-evidence",
      ],
    });

  assert(
    !missing.accepted,
    "Missing evidence must never be accepted.",
  );

  assert(
    missing.reasons.some(
      (reason) =>
        reason.includes(
          "missing",
        ),
    ),
    "Missing evidence must produce an explicit review reason.",
  );

  console.log(
    "07 evidence verification aggregation: SUCCESS",
  );

  console.log(
    "07 completion-gate integration: SUCCESS",
  );

  console.log(
    "07 failed-evidence rejection: SUCCESS",
  );

  console.log(
    "07 approval enforcement: SUCCESS",
  );

  console.log(
    "07 missing-evidence rejection: SUCCESS",
  );

  console.log(
    "TREE-07 EVIDENCE REVIEW AUTHORITY: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
