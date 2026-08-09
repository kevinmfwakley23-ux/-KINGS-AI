import type {
  KnowledgeSource,
} from "../../core/workforce/types";

import {
  type SourceInspectionPolicy,
} from "../../core/workforce/source-inspection";

import {
  SourceInspectionService,
} from "../../core/workforce/source-inspection-service";

import {
  RepositorySourceInspectionAdapter,
} from "./repository-adapter";

async function main(): Promise<void> {
  const source: KnowledgeSource = {
    id: "source-kings-collectibles-1",
    type: "repository",
    name: "KINGS Collectibles-1 Repository",
    description:
      "Authorized repository source for K.I.N.G.S. workforce inspection.",
    location:
      "/home/kevinmfwakley23/kings-collectibles-1",
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const policy: SourceInspectionPolicy = {
    projectRoot:
      "/home/kevinmfwakley23/kings-collectibles-1",
    allowedSourceIds: [
      source.id,
    ],
    allowedSourceTypes: [
      "repository",
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
    new RepositorySourceInspectionAdapter();

  const service =
    new SourceInspectionService(
      policy,
      adapter,
    );

  const architectureRequest = {
    sourceId: source.id,
    operation: "content" as const,
    relativePath:
      "architecture/SYSTEM_ARCHITECTURE.md",
  };

  const architectureResult =
    await service.inspect(
      source,
      architectureRequest,
    );

  if (
    !architectureResult.content ||
    architectureResult.content.length === 0
  ) {
    throw new Error(
      "Real repository inspection returned empty architecture content.",
    );
  }

  if (
    !architectureResult.content.includes(
      "K.I.N.G.S.",
    )
  ) {
    throw new Error(
      "Architecture inspection did not contain expected K.I.N.G.S. content.",
    );
  }

  console.log(
    "Real architecture content inspection: SUCCESS",
  );

  const metadataRequest = {
    sourceId: source.id,
    operation: "metadata" as const,
    relativePath:
      "PROJECT_LEDGER.md",
  };

  const metadataResult =
    await service.inspect(
      source,
      metadataRequest,
    );

  if (
    metadataResult.content !==
    undefined
  ) {
    throw new Error(
      "Real metadata inspection unexpectedly returned content.",
    );
  }

  if (
    metadataResult.sizeBytes <= 0
  ) {
    throw new Error(
      "Real metadata inspection returned invalid size.",
    );
  }

  console.log(
    "Real repository metadata inspection: SUCCESS",
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
      error instanceof Error &&
      error.message.includes(
        "excluded path segment",
      )
    ) {
      excludedRejected = true;
    } else {
      throw error;
    }
  }

  if (!excludedRejected) {
    throw new Error(
      "Excluded repository path was not rejected.",
    );
  }

  console.log(
    "Excluded repository path rejected: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. repository integration: SUCCESS",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
