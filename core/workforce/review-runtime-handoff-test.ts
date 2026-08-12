import type {
  WorkforceResult,
} from "./types";

import {
  OwnerIdentityAuthority,
} from "./owner-identity";

import {
  RuntimeSessionRegistry,
} from "./runtime-session";

import {
  ReviewRuntimeContextAuthority,
} from "./review-runtime-context";

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

import {
  ReviewRuntimeHandoffAuthority,
} from "./review-runtime-handoff";

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

  const ownerAuthority =
    new OwnerIdentityAuthority({
      ownerEmail:
        "owner@example.invalid",
      githubLogin:
        "kevinmfwakley23-ux",
      displayName:
        "K.I.N.G.S. Owner",
    });

  const owner =
    ownerAuthority.getOwner();

  const sessions =
    new RuntimeSessionRegistry();

  sessions.register({
    id:
      "terminal-tree-076",
    ownerId:
      owner.id,
    environment: {
      id:
        "env-tree-076",
      platform:
        "chromeos",
      hostname:
        "kings-chromebook",
      shell:
        "bash",
      workingDirectory:
        "/home/kings/KINGS-AI",
      terminalId:
        "terminal-tree-076",
      capabilities: [
        "filesystem",
        "git",
        "typescript",
        "node",
      ],
    },
    createdAt:
      now,
    updatedAt:
      now,
    active:
      true,
  });

  const runtimeContext =
    new ReviewRuntimeContextAuthority(
      ownerAuthority,
      sessions,
    );

  const evidenceStore =
    new EvidenceStore();

  evidenceStore.register({
    id:
      "evidence-tree-076",
    type:
      "test",
    criterion:
      "Tree 07.6 review passes.",
    status:
      "passed",
    summary:
      "Tree 07.6 handoff verification passed.",
    verificationReference:
      "test:tree-07.6",
    createdAt:
      now,
  });

  const evidenceReview =
    new EvidenceReviewAuthority(
      evidenceStore,
      new VerificationAuthority(
        evidenceStore,
      ),
    );

  const reviewAuthority =
    new ReviewAuthority(
      evidenceReview,
    );

  const records =
    new ReviewRecordStore();

  const resultAcceptance =
    new ReviewResultAcceptanceAuthority(
      records,
    );

  const handoff =
    new ReviewRuntimeHandoffAuthority(
      runtimeContext,
      records,
      resultAcceptance,
    );

  const review =
    reviewAuthority.review({
      taskId:
        "task-tree-076",
      reviewerId:
        owner.id,
      review: {
        taskId:
          "task-tree-076",
        contract: {
          id:
            "WORK-UNIT-tree-076",
          role:
            "Owner review worker",
          objective:
            "Verify Tree 07.6.",
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
            "Tree 07.6 review passes.",
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
          "evidence-tree-076",
        ],
      },
      requireHumanApproval:
        true,
    });

  const approved =
    reviewAuthority.approve(
      review.humanReview.id,
      owner.id,
      "Owner approved Tree 07.6.",
    );

  records.save(
    approved,
  );

  const workforceResult:
    WorkforceResult =
    {
      id:
        "result-task-tree-076",
      taskId:
        "task-tree-076",
      agentId:
        "agent-tree-076",
      status:
        "success",
      summary:
        "Tree 07.6 completed successfully.",
      artifactIds: [],
      verificationReferences: [
        "test:tree-07.6",
      ],
      createdAt:
        now,
    };

  const successful =
    handoff.handoff({
      taskId:
        "task-tree-076",
      ownerId:
        owner.id,
      ownerLogin:
        "owner@example.invalid",
      sessionId:
        "terminal-tree-076",
      reviewId:
        approved.id,
      workforceResult,
      evidenceReview:
        review.machineReview,
    });

  assert(
    successful.accepted,
    "Approved review must survive runtime handoff and result acceptance.",
  );

  assert(
    successful.context.owner.id ===
      owner.id,
    "Owner identity must survive the handoff.",
  );

  assert(
    successful.context.runtime.id ===
      "terminal-tree-076",
    "Runtime session identity must survive the handoff.",
  );

  const rejected =
    handoff.handoff({
      taskId:
        "task-tree-076",
      ownerId:
        owner.id,
      ownerLogin:
        "owner@example.invalid",
      sessionId:
        "terminal-tree-076",
      reviewId:
        "missing-review",
      workforceResult,
      evidenceReview:
        review.machineReview,
    });

  assert(
    !rejected.accepted,
    "Missing approval records must prevent runtime handoff acceptance.",
  );

  sessions.deactivate(
    "terminal-tree-076",
  );

  let inactiveRejected =
    false;

  try {
    handoff.handoff({
      taskId:
        "task-tree-076",
      ownerId:
        owner.id,
      ownerLogin:
        "owner@example.invalid",
      sessionId:
        "terminal-tree-076",
      reviewId:
        approved.id,
      workforceResult,
      evidenceReview:
        review.machineReview,
    });
  } catch {
    inactiveRejected =
      true;
  }

  assert(
    inactiveRejected,
    "Inactive runtime sessions must not accept a review handoff.",
  );

  console.log(
    "07.6 stored approval verification: SUCCESS",
  );

  console.log(
    "07.6 owner identity continuity: SUCCESS",
  );

  console.log(
    "07.6 runtime session continuity: SUCCESS",
  );

  console.log(
    "07.6 result acceptance integration: SUCCESS",
  );

  console.log(
    "07.6 missing approval rejection: SUCCESS",
  );

  console.log(
    "07.6 inactive runtime rejection: SUCCESS",
  );

  console.log(
    "TREE-07.6 REVIEW RUNTIME HANDOFF: SUCCESS",
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
