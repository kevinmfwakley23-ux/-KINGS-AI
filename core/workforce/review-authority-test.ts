import {
  EvidenceStore,
} from "./evidence-store";

import {
  VerificationAuthority,
} from "./verification-authority";

import {
  EvidenceReviewAuthority,
} from "./evidence-review-authority";

import {
  ReviewAuthority,
} from "./review-authority";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function contract() {
  const now =
    new Date().toISOString();

  return {
    id:
      "WORK-UNIT-tree-072",
    role:
      "Review worker",
    objective:
      "Review task evidence.",
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
      "The task evidence passes review.",
    ],
    requiredEvidenceTypes: [
      "test",
    ],
    approved:
      true,
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
      "evidence-tree-072-pass",
    type:
      "test",
    criterion:
      "The task evidence passes review.",
    status:
      "passed",
    summary:
      "Tree 07.2 review evidence passed.",
    verificationReference:
      "test:tree-07.2",
    createdAt:
      new Date().toISOString(),
  });

  const evidenceReview =
    new EvidenceReviewAuthority(
      store,
      new VerificationAuthority(
        store,
      ),
    );

  const reviewAuthority =
    new ReviewAuthority(
      evidenceReview,
    );

  const pending =
    reviewAuthority.review({
      taskId:
        "task-tree-072",
      reviewerId:
        "owner",
      review: {
        taskId:
          "task-tree-072",
        contract:
          contract(),
        evidenceIds: [
          "evidence-tree-072-pass",
        ],
      },
      requireHumanApproval:
        true,
    });

  assert(
    pending.machineReview.accepted,
    "Machine review must pass before human review is requested.",
  );

  assert(
    !pending.accepted,
    "A human approval gate must prevent automatic acceptance.",
  );

  assert(
    pending.humanReview.status ===
      "pending-human-review",
    "Human approval must remain pending until explicitly decided.",
  );

  const approved =
    reviewAuthority.approve(
      pending.humanReview.id,
      "owner",
      "Owner approved the reviewed evidence.",
    );

  assert(
    approved.status ===
      "approved",
    "Explicit owner approval must move review to approved state.",
  );

  let wrongReviewerRejected =
    false;

  try {
    reviewAuthority.approve(
      pending.humanReview.id,
      "different-reviewer",
      "Unauthorized approval attempt.",
    );
  } catch {
    wrongReviewerRejected =
      true;
  }

  assert(
    wrongReviewerRejected,
    "Approval authority must be bound to the designated reviewer.",
  );

  const rejected =
    reviewAuthority.review({
      taskId:
        "task-tree-072-rejected",
      reviewerId:
        "owner",
      review: {
        taskId:
          "task-tree-072-rejected",
        contract:
          contract(),
        evidenceIds: [],
      },
      requireHumanApproval:
        true,
    });

  assert(
    rejected.humanReview.status ===
      "rejected",
    "Machine-review failure must produce a rejected decision.",
  );

  console.log(
    "07.2 machine review boundary: SUCCESS",
  );

  console.log(
    "07.2 explicit human approval gate: SUCCESS",
  );

  console.log(
    "07.2 owner approval authority: SUCCESS",
  );

  console.log(
    "07.2 reviewer attribution enforcement: SUCCESS",
  );

  console.log(
    "07.2 automatic rejection on failed evidence: SUCCESS",
  );

  console.log(
    "TREE-07.2 HUMAN REVIEW AUTHORITY: SUCCESS",
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
