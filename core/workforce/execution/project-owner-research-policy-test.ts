import {
  ProjectOwnerResearchPolicyAuthority,
  ProjectOwnerResearchPolicyError,
} from "./project-owner-research-policy";

import type {
  ExternalResearchRequest,
} from "./external-research";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function expectPolicyError(
  action: () => void,
  message: string,
): void {
  let failed = false;

  try {
    action();
  } catch (error) {
    failed = error instanceof ProjectOwnerResearchPolicyError;
  }

  assert(failed, message);
}

const baseNow = Date.now();
const approvedAt = new Date(baseNow - 60_000).toISOString();
const expiresAt = new Date(baseNow + 29 * 60_000).toISOString();
const tooLateExpiresAt = new Date(baseNow + 61 * 60_000).toISOString();
const expiredApprovedAt = new Date(baseNow - 60 * 60_000).toISOString();
const expiredExpiresAt = new Date(baseNow - 30 * 60_000).toISOString();

const authority =
  new ProjectOwnerResearchPolicyAuthority({
    ownerId: "owner-kevin",
    projectId: "project-memory-005",
    approvalRequired: true,
    allowedHosts: [
      "doc.rust-lang.org",
      "rust-lang.org",
    ],
    maxSources: 5,
    maxDurationMs: 60 * 60 * 1000,
  });

const approval = {
  approvalId:
    "approval-research-rust-001",
  ownerId:
    "owner-kevin",
  projectId:
    "project-memory-005",
  taskId:
    "task-research-rust-001",
  researchId:
    "research-rust-001",
  question:
    "Learn the Rust language, Cargo workflow, and official testing guidance required for this project.",
  allowedHosts: [
    "doc.rust-lang.org",
  ],
  approvedAt,
  expiresAt,
  reason:
    "Project Owner approved official Rust documentation research for capability acquisition.",
};

authority.approve(
  approval,
);

console.log(
  "001.RESEARCH Project Owner approval registration: SUCCESS",
);

const authorized: ExternalResearchRequest = {
  researchId:
    "research-rust-001",
  taskId:
    "task-research-rust-001",
  question:
    "Learn the Rust language, Cargo workflow, and official testing guidance required for this project.",
  urls: [
    "https://doc.rust-lang.org/book/",
    "https://doc.rust-lang.org/cargo/",
  ],
  maxSources:
    2,
};

authority.authorize(
  authorized,
);

console.log(
  "002.RESEARCH authorized scoped research: SUCCESS",
);

expectPolicyError(
  () =>
    authority.authorize({
      ...authorized,
      taskId:
        "task-other-project",
    }),
  "Wrong task must be rejected.",
);

console.log(
  "003.RESEARCH wrong task rejection: SUCCESS",
);

expectPolicyError(
  () =>
    authority.authorize({
      ...authorized,
      question:
        "Search arbitrary information about unrelated topics.",
    }),
  "Research outside the approved question scope must be rejected.",
);

console.log(
  "004.RESEARCH wrong question rejection: SUCCESS",
);

expectPolicyError(
  () =>
    authority.authorize({
      ...authorized,
      urls: [
        "https://example.com/",
      ],
    }),
  "Unapproved host must be rejected.",
);

console.log(
  "005.RESEARCH unapproved host rejection: SUCCESS",
);

expectPolicyError(
  () =>
    authority.approve({
      ...approval,
      expiresAt:
        tooLateExpiresAt,
    }),
  "Approval exceeding the configured maximum duration must be rejected.",
);

console.log(
  "006.RESEARCH approval duration boundary: SUCCESS",
);

const expiredAuthority =
  new ProjectOwnerResearchPolicyAuthority({
    ownerId: "owner-kevin",
    projectId: "project-memory-005",
    approvalRequired: true,
    allowedHosts: [
      "doc.rust-lang.org",
    ],
    maxSources: 5,
    maxDurationMs: 60 * 60 * 1000,
  });

expiredAuthority.approve({
  ...approval,
  approvalId:
    "approval-expired",
  approvedAt:
    expiredApprovedAt,
  expiresAt:
    expiredExpiresAt,
});

expectPolicyError(
  () =>
    expiredAuthority.authorize(
      authorized,
    ),
  "Expired approval must be rejected.",
);

console.log(
  "007.RESEARCH expired approval rejection: SUCCESS",
);

expectPolicyError(
  () =>
    authority.approve({
      ...approval,
      ownerId:
        "different-owner",
      approvalId:
        "approval-wrong-owner",
    }),
  "Approval from a different owner must be rejected.",
);

console.log(
  "008.RESEARCH Project Owner identity enforcement: SUCCESS",
);

authority.revoke(
  approval.approvalId,
  "owner-kevin",
);

expectPolicyError(
  () =>
    authority.authorize(
      authorized,
    ),
  "Revoked approval must no longer authorize research.",
);

console.log(
  "009.RESEARCH approval revocation: SUCCESS",
);

console.log(
  "MISSION-005 POLICY AUTHORITY: SUCCESS",
);
