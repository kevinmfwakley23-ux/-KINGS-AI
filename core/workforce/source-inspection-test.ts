import type {
  KnowledgeSource,
} from "./types";

import {
  SourceInspectionPolicyError,
  validateInspectionPolicy,
  validateInspectionRequest,
  type SourceInspectionPolicy,
} from "./source-inspection";

function expectRejected(
  label: string,
  action: () => void,
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof SourceInspectionPolicyError) {
      console.log(`${label}: SUCCESS`);
      return;
    }

    throw error;
  }

  throw new Error(`${label}: expected rejection`);
}

function main(): void {
  const source: KnowledgeSource = {
    id: "source-kings-architecture-test",
    type: "construction-document",
    name: "KINGS Architecture Test Source",
    description: "Controlled source inspection test source.",
    location: "/home/test/kings-collectibles-1/architecture",
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const policy: SourceInspectionPolicy = {
    projectRoot: "/home/test/kings-collectibles-1",
    allowedSourceIds: [
      source.id,
    ],
    allowedSourceTypes: [
      "construction-document",
      "blueprint",
      "project-ledger",
      "implementation-matrix",
    ],
    allowedOperations: [
      "metadata",
      "content",
    ],
    excludedPathSegments: [
      ".git",
      "node_modules",
      ".next",
      ".turbo",
    ],
  };

  validateInspectionPolicy(
    source,
    policy,
  );

  console.log(
    "Valid source policy: SUCCESS",
  );

  validateInspectionRequest(
    source,
    {
      sourceId: source.id,
      operation: "metadata",
      relativePath: "architecture/SYSTEM_ARCHITECTURE.md",
    },
    policy,
  );

  console.log(
    "Valid inspection request: SUCCESS",
  );

  expectRejected(
    "Unauthorized source rejected",
    () =>
      validateInspectionRequest(
        source,
        {
          sourceId: "source-not-authorized",
          operation: "metadata",
          relativePath: "architecture/SYSTEM_ARCHITECTURE.md",
        },
        policy,
      ),
  );

  expectRejected(
    "Unauthorized operation rejected",
    () =>
      validateInspectionRequest(
        source,
        {
          sourceId: source.id,
          operation: "metadata",
          relativePath: ".git/config",
        },
        {
          ...policy,
          allowedOperations: ["content"],
        },
      ),
  );

  expectRejected(
    "Absolute path rejected",
    () =>
      validateInspectionRequest(
        source,
        {
          sourceId: source.id,
          operation: "content",
          relativePath:
            "/home/test/kings-collectibles-1/README.md",
        },
        policy,
      ),
  );

  expectRejected(
    "Parent traversal rejected",
    () =>
      validateInspectionRequest(
        source,
        {
          sourceId: source.id,
          operation: "content",
          relativePath:
            "architecture/../../secrets.txt",
        },
        policy,
      ),
  );

  expectRejected(
    "Git directory rejected",
    () =>
      validateInspectionRequest(
        source,
        {
          sourceId: source.id,
          operation: "content",
          relativePath: ".git/config",
        },
        policy,
      ),
  );

  expectRejected(
    "Node modules rejected",
    () =>
      validateInspectionRequest(
        source,
        {
          sourceId: source.id,
          operation: "content",
          relativePath: "node_modules/package/index.js",
        },
        policy,
      ),
  );

  expectRejected(
    "Next build directory rejected",
    () =>
      validateInspectionRequest(
        source,
        {
          sourceId: source.id,
          operation: "content",
          relativePath: ".next/server/app.js",
        },
        policy,
      ),
  );

  expectRejected(
    "Turbo cache rejected",
    () =>
      validateInspectionRequest(
        source,
        {
          sourceId: source.id,
          operation: "content",
          relativePath: ".turbo/cache/data",
        },
        policy,
      ),
  );

  console.log(
    "Source inspection policy test: SUCCESS",
  );
}

main();
