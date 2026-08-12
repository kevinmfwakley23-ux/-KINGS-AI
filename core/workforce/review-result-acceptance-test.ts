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
  ReviewRecordStore,
} from "./review-record-store";

import {
  ReviewResultAcceptanceAuthority,
} from "./review-result-acceptance";

import type {
  WorkforceResult,
} from "./types";

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

async function main(): Promise<void> {
  const now =
    new Date().toISOString();

  const store =
    new EvidenceStore();

  store.register({
    id:
      "evidence-tree-074",
    type:
      "test",
    criterion:
      "Task verification passes.",
    status:
      "passed",
    summary:
      "Tree 07.4 verification passed.",
    verificationReference:
      "test:tree-07.4",
    createdAt:
      now,
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

  const records =
    new ReviewRecordStore();

  const acceptance =
    new ReviewResultAcceptanceAuthority(
      records,
    );

  const review =
    reviewAuthority.review({
      taskId:
        "task-tree-074",
      reviewerId:
        "owner",
      review: {
        taskId:
          "task-tree-074",
        contract: {
          id:
            "WORK-UNIT-tree-074",
          role:
            "Owner",
          objective:
            "Verify the task.",
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
            "Task verification passes.",
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
        },
        evidenceIds: [
          "evidence-tree-074",
        ],
      },
      requireHumanApproval:
        true,
    });

  assert(
    review.machineReview.accepted,
    "Machine review must pass before owner approval.",
  );

  const approved =
    reviewAuthority.approve(
      review.humanReview.id,
      "owner",
      "Owner approved the verified task result.",
    );

  records.save(
    approved,
  );

  const workforceResult: WorkforceResult =
    {
      id:
        "result-task-tree-074",
      taskId:
        "task-tree-074",
      agentId:
        "agent-tree-074",
      status:
        "success",
      summary:
        "Task completed successfully.",
      artifactIds: [],
      verificationReferences: [
        "test:tree-07.4",
      ],
      createdAt:
        now,
    };

  const accepted =
    acceptance.accept({
      taskId:
        "task-tree-074",
      result:
        workforceResult,
      machineReview:
        review.machineReview,
      humanReview:
        approved,
    });

  assert(
    accepted.accepted,
    "Verified result with durable owner approval must be accepted.",
  );

  assert(
    !!accepted.acceptedAt,
    "Accepted result must have an acceptance timestamp.",
  );

  console.log(
    "07.4 durable review record: SUCCESS",
  );

  console.log(
    "07.4 owner approval to result acceptance: SUCCESS",
  );

  console.log(
    "07.4 accepted result: SUCCESS",
  );

  console.log(
    "TREE-07.4 REVIEW / RESULT ACCEPTANCE: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
