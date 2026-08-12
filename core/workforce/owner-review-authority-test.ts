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

import {
  OwnerReviewAuthority,
  type OwnerIdentity,
} from "./owner-review-authority";

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

function contract() {
  const now =
    new Date().toISOString();

  return {
    id:
      "WORK-UNIT-tree-073",
    role:
      "Owner review worker",
    objective:
      "Submit evidence for owner review.",
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
      "Owner review evidence passes.",
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
  const owner:
    OwnerIdentity =
    {
      id:
        "owner",
      displayName:
        "K.I.N.G.S. Owner",
      role:
        "owner",
    };

  const store =
    new EvidenceStore();

  store.register({
    id:
      "evidence-tree-073",
    type:
      "test",
    criterion:
      "Owner review evidence passes.",
    status:
      "passed",
    summary:
      "Owner review test evidence passed.",
    verificationReference:
      "test:tree-073",
    createdAt:
      new Date().toISOString(),
  });

  const authority =
    new OwnerReviewAuthority(
      owner,
      new ReviewAuthority(
        new EvidenceReviewAuthority(
          store,
          new VerificationAuthority(
            store,
          ),
        ),
      ),
    );

  const pending =
    authority.review({
      owner,
      taskId:
        "task-tree-073",
      reviewerId:
        owner.id,
      review: {
        taskId:
          "task-tree-073",
        contract:
          contract(),
        evidenceIds: [
          "evidence-tree-073",
        ],
      },
      requireHumanApproval:
        true,
    });

  assert(
    pending.review.machineReview.accepted,
    "Machine evidence review must pass before owner approval.",
  );

  assert(
    pending.review.humanReview.status ===
      "pending-human-review",
    "Owner-gated review must remain pending before approval.",
  );

  const approved =
    authority.approve(
      pending.review.humanReview.id,
      owner.id,
      "Owner approved the verified evidence.",
    );

  assert(
    approved.status ===
      "approved",
    "Configured owner must be able to approve pending review.",
  );

  let nonOwnerRejected =
    false;

  try {
    authority.approve(
      pending.review.humanReview.id,
      "not-owner",
      "Unauthorized approval.",
    );
  } catch {
    nonOwnerRejected =
      true;
  }

  assert(
    nonOwnerRejected,
    "Non-owner approval attempts must be rejected.",
  );

  let spoofedOwnerRejected =
    false;

  try {
    authority.review({
      owner: {
        id:
          "spoofed-owner",
        displayName:
          "Spoofed Owner",
        role:
          "owner",
      },
      taskId:
        "task-tree-073",
      reviewerId:
        "spoofed-owner",
      review: {
        taskId:
          "task-tree-073",
        contract:
          contract(),
        evidenceIds: [
          "evidence-tree-073",
        ],
      },
      requireHumanApproval:
        true,
    });
  } catch {
    spoofedOwnerRejected =
      true;
  }

  assert(
    spoofedOwnerRejected,
    "Owner identity spoofing must be rejected.",
  );

  console.log(
    "07.3 owner identity enforcement: SUCCESS",
  );

  console.log(
    "07.3 owner-scoped review submission: SUCCESS",
  );

  console.log(
    "07.3 explicit owner approval: SUCCESS",
  );

  console.log(
    "07.3 non-owner approval rejection: SUCCESS",
  );

  console.log(
    "07.3 owner identity spoofing rejection: SUCCESS",
  );

  console.log(
    "TREE-07.3 OWNER REVIEW AUTHORITY: SUCCESS",
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
