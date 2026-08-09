import type {
  KnowledgeSource,
} from "./types";

import type {
  SourceInspectionRequest,
} from "./source-inspection";

import {
  TestSourceInspectionAdapter,
} from "./test-source-inspection-adapter";

async function main(): Promise<void> {
  const source: KnowledgeSource = {
    id: "source-test-adapter",
    type: "construction-document",
    name: "Test Construction Source",
    description: "Controlled adapter test source.",
    location: "/test/kings-collectibles-1",
    authoritative: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const content = new Map<string, string>();

  content.set(
    `${source.id}:architecture/SYSTEM_ARCHITECTURE.md`,
    "K.I.N.G.S. system architecture test content.",
  );

  content.set(
    `${source.id}:architecture/README.md`,
    "Architecture directory test content.",
  );

  const adapter =
    new TestSourceInspectionAdapter(
      content,
    );

  const contentRequest: SourceInspectionRequest = {
    sourceId: source.id,
    operation: "content",
    relativePath:
      "architecture/SYSTEM_ARCHITECTURE.md",
  };

  const contentResult =
    await adapter.inspect(
      source,
      contentRequest,
    );

  if (
    contentResult.content !==
    "K.I.N.G.S. system architecture test content."
  ) {
    throw new Error(
      "Content inspection returned unexpected content.",
    );
  }

  console.log(
    "Content retrieval: SUCCESS",
  );

  const metadataRequest: SourceInspectionRequest = {
    sourceId: source.id,
    operation: "metadata",
    relativePath:
      "architecture/README.md",
  };

  const metadataResult =
    await adapter.inspect(
      source,
      metadataRequest,
    );

  if (
    metadataResult.content !==
    undefined
  ) {
    throw new Error(
      "Metadata inspection unexpectedly returned content.",
    );
  }

  if (
    metadataResult.sizeBytes <= 0
  ) {
    throw new Error(
      "Metadata inspection returned invalid file size.",
    );
  }

  console.log(
    "Metadata-only retrieval: SUCCESS",
  );

  let missingRejected = false;

  try {
    await adapter.inspect(
      source,
      {
        sourceId: source.id,
        operation: "content",
        relativePath:
          "architecture/MISSING.md",
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("not found")
    ) {
      missingRejected = true;
    } else {
      throw error;
    }
  }

  if (!missingRejected) {
    throw new Error(
      "Missing source content was not rejected.",
    );
  }

  console.log(
    "Missing content rejected: SUCCESS",
  );

  const oversizedContent =
    new Map<string, string>();

  oversizedContent.set(
    `${source.id}:large.md`,
    "1234567890",
  );

  const limitedAdapter =
    new TestSourceInspectionAdapter(
      oversizedContent,
      5,
    );

  let oversizedRejected = false;

  try {
    await limitedAdapter.inspect(
      source,
      {
        sourceId: source.id,
        operation: "content",
        relativePath: "large.md",
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("exceeds content limit")
    ) {
      oversizedRejected = true;
    } else {
      throw error;
    }
  }

  if (!oversizedRejected) {
    throw new Error(
      "Oversized content was not rejected.",
    );
  }

  console.log(
    "Content-size limit enforced: SUCCESS",
  );

  console.log(
    "Test source inspection adapter: SUCCESS",
  );
}

main().catch((error) => {
  console.error(error);
  throw error;
});
