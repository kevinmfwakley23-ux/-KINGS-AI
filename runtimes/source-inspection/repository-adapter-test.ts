import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import type {
  KnowledgeSource,
} from "../../core/workforce/types";

import type {
  SourceInspectionRequest,
} from "../../core/workforce/source-inspection";

import {
  RepositorySourceInspectionAdapter,
} from "./repository-adapter";

async function expectRejected(
  label: string,
  action: () => Promise<unknown>,
  expectedText: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(expectedText)
    ) {
      console.log(`${label}: SUCCESS`);
      return;
    }

    throw error;
  }

  throw new Error(
    `${label}: expected rejection`,
  );
}

async function main(): Promise<void> {
  const temporaryRoot =
    await mkdtemp(
      join(
        tmpdir(),
        "kings-ai-source-inspection-",
      ),
    );

  try {
    const repositoryRoot =
      join(
        temporaryRoot,
        "repository",
      );

    await mkdir(
      join(
        repositoryRoot,
        "architecture",
      ),
      {
        recursive: true,
      },
    );

    const architectureFile =
      join(
        repositoryRoot,
        "architecture",
        "SYSTEM_ARCHITECTURE.md",
      );

    await writeFile(
      architectureFile,
      "K.I.N.G.S. runtime inspection test content.",
      "utf8",
    );

    const source: KnowledgeSource = {
      id: "source-runtime-test",
      type: "construction-document",
      name: "Runtime Source Inspection Test",
      description:
        "Controlled filesystem-backed source inspection test.",
      location: repositoryRoot,
      authoritative: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const adapter =
      new RepositorySourceInspectionAdapter();

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
      "K.I.N.G.S. runtime inspection test content."
    ) {
      throw new Error(
        "Content inspection returned unexpected content.",
      );
    }

    if (
      contentResult.sizeBytes <= 0
    ) {
      throw new Error(
        "Content inspection returned invalid file size.",
      );
    }

    console.log(
      "Content retrieval: SUCCESS",
    );

    const metadataRequest: SourceInspectionRequest = {
      sourceId: source.id,
      operation: "metadata",
      relativePath:
        "architecture/SYSTEM_ARCHITECTURE.md",
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

    if (
      metadataResult.createdAt.length === 0
    ) {
      throw new Error(
        "Metadata inspection returned empty creation time.",
      );
    }

    console.log(
      "Metadata-only retrieval: SUCCESS",
    );

    await expectRejected(
      "Missing file rejected",
      () =>
        adapter.inspect(
          source,
          {
            sourceId: source.id,
            operation: "content",
            relativePath:
              "architecture/MISSING.md",
          },
        ),
      "not found",
    );

    await expectRejected(
      "Directory rejected",
      () =>
        adapter.inspect(
          source,
          {
            sourceId: source.id,
            operation: "content",
            relativePath:
              "architecture",
          },
        ),
      "not a file",
    );

    const oversizedFile =
      join(
        repositoryRoot,
        "oversized.txt",
      );

    await writeFile(
      oversizedFile,
      "1234567890",
      "utf8",
    );

    const limitedAdapter =
      new RepositorySourceInspectionAdapter(
        5,
      );

    await expectRejected(
      "Content-size limit enforced",
      () =>
        limitedAdapter.inspect(
          source,
          {
            sourceId: source.id,
            operation: "content",
            relativePath:
              "oversized.txt",
          },
        ),
      "exceeds content limit",
    );

    await expectRejected(
      "Absolute path rejected",
      () =>
        adapter.inspect(
          source,
          {
            sourceId: source.id,
            operation: "content",
            relativePath:
              "/etc/passwd",
          },
        ),
      "invalid relative path",
    );

    await expectRejected(
      "Parent traversal rejected",
      () =>
        adapter.inspect(
          source,
          {
            sourceId: source.id,
            operation: "content",
            relativePath:
              "../outside.txt",
          },
        ),
      "invalid relative path",
    );

    const outsideFile =
      join(
        temporaryRoot,
        "outside.txt",
      );

    await writeFile(
      outsideFile,
      "outside repository",
      "utf8",
    );

    const symlinkPath =
      join(
        repositoryRoot,
        "architecture",
        "outside-link.txt",
      );

    try {
      await symlink(
        outsideFile,
        symlinkPath,
      );

      await expectRejected(
        "Symlink escape rejected",
        () =>
          adapter.inspect(
            source,
            {
              sourceId: source.id,
              operation: "content",
              relativePath:
                "architecture/outside-link.txt",
            },
          ),
        "path escapes source location",
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(
          "EEXIST",
        )
      ) {
        console.log(
          "Symlink test skipped: existing link",
        );
      } else {
        throw error;
      }
    }

    console.log(
      "Repository source inspection adapter: SUCCESS",
    );
  } finally {
    await rm(
      temporaryRoot,
      {
        recursive: true,
        force: true,
      },
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
