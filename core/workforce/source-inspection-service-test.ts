import type {
  KnowledgeSource,
} from "./types";

import {
  SourceInspectionPolicyError,
  type SourceInspectionPolicy,
} from "./source-inspection";

import type {
  SourceInspectionAdapter,
} from "./source-inspection-adapter";

import type {
  SourceInspectionRequest,
} from "./source-inspection";

import {
  SourceInspectionService,
} from "./source-inspection-service";

class TestInspectionAdapter
  implements SourceInspectionAdapter
{
  public callCount = 0;

  async inspect(
    source: KnowledgeSource,
    request: SourceInspectionRequest,
  ) {
    this.callCount += 1;

    return {
      sourceId: source.id,
      operation: request.operation,
      path: `${source.location}/${request.relativePath ?? ""}`,
      content:
        request.operation === "content"
          ? "authorized test content"
          : undefined,
      sizeBytes: 23,
      createdAt: new Date().toISOString(),
    };
  }
}

async function main(): Promise<void> {
  const source: KnowledgeSource = {
    id: "source-service-test",
    type: "construction-document",
    name: "Service Test Source",
    description: "Source used to test inspection service authorization.",
    location: "/approved/kings-collectibles-1/architecture",
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const policy: SourceInspectionPolicy = {
    projectRoot: "/approved/kings-collectibles-1",
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

  const adapter =
    new TestInspectionAdapter();

  const service =
    new SourceInspectionService(
      policy,
      adapter,
    );

  const authorizedResult =
    await service.inspect(
      source,
      {
        sourceId: source.id,
        operation: "content",
        relativePath:
          "SYSTEM_ARCHITECTURE.md",
      },
    );

  if (
    adapter.callCount !== 1
  ) {
    throw new Error(
      `Expected adapter to be called once, got ${adapter.callCount}`,
    );
  }

  if (
    authorizedResult.sourceId !== source.id ||
    authorizedResult.operation !== "content"
  ) {
    throw new Error(
      "Authorized inspection returned an unexpected result.",
    );
  }

  console.log(
    "Authorized request reached adapter: SUCCESS",
  );

  let rejected = false;

  try {
    await service.inspect(
      source,
      {
        sourceId: source.id,
        operation: "content",
        relativePath:
          "../../outside-project.txt",
      },
    );
  } catch (error) {
    if (
      error instanceof SourceInspectionPolicyError
    ) {
      rejected = true;
    } else {
      throw error;
    }
  }

  if (!rejected) {
    throw new Error(
      "Unauthorized inspection request was not rejected.",
    );
  }

  if (
    adapter.callCount !== 1
  ) {
    throw new Error(
      `Unauthorized request reached adapter. Call count: ${adapter.callCount}`,
    );
  }

  console.log(
    "Unauthorized request rejected before adapter: SUCCESS",
  );

  let excludedRejected = false;

  try {
    await service.inspect(
      source,
      {
        sourceId: source.id,
        operation: "content",
        relativePath:
          ".git/config",
      },
    );
  } catch (error) {
    if (
      error instanceof SourceInspectionPolicyError
    ) {
      excludedRejected = true;
    } else {
      throw error;
    }
  }

  if (!excludedRejected) {
    throw new Error(
      "Excluded path was not rejected.",
    );
  }

  if (
    adapter.callCount !== 1
  ) {
    throw new Error(
      `Excluded path reached adapter. Call count: ${adapter.callCount}`,
    );
  }

  console.log(
    "Excluded path rejected before adapter: SUCCESS",
  );

  console.log(
    "Source inspection service authorization test: SUCCESS",
  );
}

main().catch((error) => {
  console.error(error);
  throw error;
});
