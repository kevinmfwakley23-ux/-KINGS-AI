import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import type {
  KnowledgeSource,
} from "./types";

import {
  RepositoryInspector,
} from "./repository-inspector";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const root =
    await mkdtemp(
      "/tmp/kings-tree-061-",
    );

  await mkdir(
    join(
      root,
      "src",
    ),
    {
      recursive:
        true,
    },
  );

  await mkdir(
    join(
      root,
      "node_modules",
    ),
    {
      recursive:
        true,
    },
  );

  await writeFile(
    join(
      root,
      "package.json",
    ),
    JSON.stringify({
      name:
        "tree-061-test",
    }),
    "utf8",
  );

  await writeFile(
    join(
      root,
      "tsconfig.json",
    ),
    JSON.stringify({
      compilerOptions: {},
    }),
    "utf8",
  );

  await writeFile(
    join(
      root,
      "src",
      "index.ts",
    ),
    "export const TREE_061 = true;\n",
    "utf8",
  );

  await writeFile(
    join(
      root,
      "node_modules",
      "ignored.txt",
    ),
    "ignored\n",
    "utf8",
  );

  const source:
    KnowledgeSource = {
    id:
      "source-tree-061",
    type:
      "repository",
    name:
      "Tree 06.1 Test Repository",
    location:
      root,
    description:
      "Controlled repository inspection fixture.",
    authoritative:
      true,
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const inspector =
    new RepositoryInspector({
      projectRoot:
        root,
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
        "node_modules",
        ".git",
      ],
      maxFiles:
        100,
      maxFileBytes:
        4096,
      inspectExtensions: [
        ".ts",
        ".tsx",
        ".json",
      ],
    });

  try {
    const result =
      await inspector.inspect(
        source,
      );

    assert(
      result.rootPath ===
        root,
      "Inspection must preserve the authorized repository root.",
    );

    assert(
      result.packageManifestPaths.includes(
        "package.json",
      ),
      "Repository inspection must identify package manifests.",
    );

    assert(
      result.typeScriptProjectPaths.includes(
        "tsconfig.json",
      ),
      "Repository inspection must identify TypeScript project configuration.",
    );

    assert(
      result.typeScriptProjectPaths.includes(
        "src/index.ts",
      ),
      "Repository inspection must identify TypeScript source files.",
    );

    assert(
      !result.files.some(
        (file) =>
          file.relativePath.startsWith(
            "node_modules/",
          ),
      ),
      "Excluded dependency directories must not be inspected.",
    );

    const content =
      await inspector.readTextFile(
        source,
        "src/index.ts",
      );

    assert(
      content.includes(
        "TREE_061",
      ),
      "Authorized source content must be readable.",
    );

    let traversalRejected =
      false;

    try {
      await inspector.readTextFile(
        source,
        "../outside.ts",
      );
    } catch {
      traversalRejected =
        true;
    }

    assert(
      traversalRejected,
      "Repository inspection must reject path traversal.",
    );

    const unauthorizedSource:
      KnowledgeSource = {
      ...source,
      id:
        "unauthorized-source",
    };

    let sourceRejected =
      false;

    try {
      await inspector.inspect(
        unauthorizedSource,
      );
    } catch {
      sourceRejected =
        true;
    }

    assert(
      sourceRejected,
      "Unauthorized repository sources must be rejected.",
    );

    console.log(
      "06.1 repository metadata inspection: SUCCESS",
    );

    console.log(
      "06.1 source discovery and classification: SUCCESS",
    );

    console.log(
      "06.1 dependency exclusion: SUCCESS",
    );

    console.log(
      "06.1 authorized source reading: SUCCESS",
    );

    console.log(
      "06.1 path traversal protection: SUCCESS",
    );

    console.log(
      "06.1 source authorization: SUCCESS",
    );

    console.log(
      "TREE-06.1 REPOSITORY INSPECTION: SUCCESS",
    );
  } finally {
    await rm(
      root,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }
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
