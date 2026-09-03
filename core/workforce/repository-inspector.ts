import {
  readdir,
  stat,
  lstat,
  realpath,
  readFile,
} from "node:fs/promises";

import {
  join,
  relative,
  resolve,
  basename,
  isAbsolute,
} from "node:path";

import type {
  ID,
  KnowledgeSource,
} from "./types";

import {
  validateInspectionRequest,
  type SourceInspectionPolicy,
  type SourceInspectionRequest,
} from "./source-inspection";

export interface RepositoryInspectionPolicy
  extends SourceInspectionPolicy {
  maxFiles: number;
  maxFileBytes: number;
  inspectExtensions: string[];
}

export interface RepositoryFileSummary {
  relativePath: string;
  sizeBytes: number;
  isDirectory: boolean;
}

export interface RepositoryInspectionResult {
  sourceId: ID;
  rootPath: string;
  files: RepositoryFileSummary[];
  packageManifestPaths: string[];
  typeScriptProjectPaths: string[];
  gitPaths: string[];
  inspectedAt: string;
}

export class RepositoryInspectionError
  extends Error {
  constructor(
    message: string,
  ) {
    super(
      `K.I.N.G.S. Repository Inspector: ${message}`,
    );
    this.name =
      "RepositoryInspectionError";
  }
}

function normalizeRelativePath(
  value: string,
): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

function isExcluded(
  path: string,
  excluded:
    string[],
): boolean {
  const normalized =
    normalizeRelativePath(
      path,
    );

  return excluded.some(
    (segment) =>
      normalized ===
        segment ||
      normalized.startsWith(
        `${segment}/`,
      ) ||
      normalized.includes(
        `/${segment}/`,
      ),
  );
}

function isWithinRoot(
  candidate: string,
  root: string,
): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function walk(
  root: string,
  current: string,
  policy:
    RepositoryInspectionPolicy,
  output:
    RepositoryFileSummary[],
): Promise<void> {
  if (
    output.length >=
    policy.maxFiles
  ) {
    return;
  }

  const entries =
    await readdir(
      current,
      {
        withFileTypes:
          true,
      },
    );

  for (
    const entry of
      entries
  ) {
    if (
      output.length >=
      policy.maxFiles
    ) {
      return;
    }

    const absolute =
      join(
        current,
        entry.name,
      );

    const rel =
      normalizeRelativePath(
        relative(
          root,
          absolute,
        ),
      );

    if (
      isExcluded(
        rel,
        policy.excludedPathSegments,
      )
    ) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (
      entry.isDirectory()
    ) {
      output.push({
        relativePath:
          rel,
        sizeBytes:
          0,
        isDirectory:
          true,
      });

      await walk(
        root,
        absolute,
        policy,
        output,
      );

      continue;
    }

    const fileStat =
      await stat(
        absolute,
      );

    if (
      fileStat.size >
      policy.maxFileBytes
    ) {
      output.push({
        relativePath:
          rel,
        sizeBytes:
          fileStat.size,
        isDirectory:
          false,
      });

      continue;
    }

    output.push({
      relativePath:
        rel,
      sizeBytes:
        fileStat.size,
      isDirectory:
        false,
    });
  }
}

export class RepositoryInspector {
  constructor(
    private readonly policy:
      RepositoryInspectionPolicy,
  ) {
    if (
      policy.maxFiles <
      1
    ) {
      throw new RepositoryInspectionError(
        "maxFiles must be greater than zero",
      );
    }

    if (
      policy.maxFileBytes <
      1
    ) {
      throw new RepositoryInspectionError(
        "maxFileBytes must be greater than zero",
      );
    }
  }

  async inspect(
    source:
      KnowledgeSource,
  ): Promise<
    RepositoryInspectionResult
  > {
    const request:
      SourceInspectionRequest =
      {
        sourceId:
          source.id,
        operation:
          "metadata",
      };

    validateInspectionRequest(
      source,
      request,
      this.policy,
    );

    const root =
      resolve(
        this.policy.projectRoot,
      );

    const files:
      RepositoryFileSummary[] =
      [];

    await walk(
      root,
      root,
      this.policy,
      files,
    );

    const packageManifestPaths =
      files
        .filter((file) => {
          if (file.isDirectory) {
            return false;
          }

          const name =
            basename(
              file.relativePath,
            );

          return (
            name === "package.json" ||
            name === "package-lock.json" ||
            name === "pnpm-lock.yaml" ||
            name === "yarn.lock"
          );
        })
        .map(
          (file) =>
            file.relativePath,
        );

    const typeScriptProjectPaths =
      files
        .filter((file) => {
          if (file.isDirectory) {
            return false;
          }

          return (
            file.relativePath.endsWith(
              "tsconfig.json",
            ) ||
            file.relativePath.endsWith(
              ".ts",
            ) ||
            file.relativePath.endsWith(
              ".tsx",
            )
          );
        })
        .map(
          (file) =>
            file.relativePath,
        );

    const gitPaths =
      files
        .filter(
          (file) =>
            file.relativePath ===
              ".git" ||
            file.relativePath.startsWith(
              ".git/",
            ),
        )
        .map(
          (file) =>
            file.relativePath,
        );

    return {
      sourceId:
        source.id,
      rootPath:
        root,
      files,
      packageManifestPaths,
      typeScriptProjectPaths,
      gitPaths,
      inspectedAt:
        new Date().toISOString(),
    };
  }

  async readTextFile(
    source:
      KnowledgeSource,
    relativePath:
      string,
  ): Promise<string> {
    const normalized =
      normalizeRelativePath(
        relativePath,
      );

    const request:
      SourceInspectionRequest =
      {
        sourceId:
          source.id,
        operation:
          "content",
        relativePath:
          normalized,
      };

    validateInspectionRequest(
      source,
      request,
      this.policy,
    );

    if (
      !this.policy.allowedOperations.includes(
        "content",
      )
    ) {
      throw new RepositoryInspectionError(
        "content inspection is not authorized",
      );
    }

    const absolute =
      resolve(
        this.policy.projectRoot,
        normalized,
      );

    const root =
      resolve(
        this.policy.projectRoot,
      );

    const relFromRoot =
      normalizeRelativePath(
        relative(
          root,
          absolute,
        ),
      );

    if (
      relFromRoot !==
      normalized
    ) {
      throw new RepositoryInspectionError(
        "requested path escapes the repository root",
      );
    }

    const lexicalStat = await lstat(absolute);
    if (lexicalStat.isSymbolicLink()) {
      throw new RepositoryInspectionError(
        `path "${normalized}" is a symbolic link and cannot be inspected`,
      );
    }

    const [realRoot, realFile] = await Promise.all([
      realpath(root),
      realpath(absolute),
    ]);
    if (!isWithinRoot(realFile, realRoot)) {
      throw new RepositoryInspectionError(
        `path "${normalized}" resolves outside the repository root`,
      );
    }

    const fileStat =
      await stat(
        realFile,
      );

    if (
      fileStat.isDirectory()
    ) {
      throw new RepositoryInspectionError(
        `path "${normalized}" is a directory`,
      );
    }

    if (
      fileStat.size >
      this.policy.maxFileBytes
    ) {
      throw new RepositoryInspectionError(
        `file "${normalized}" exceeds the configured size limit`,
      );
    }

    return readFile(
      realFile,
      "utf8",
    );
  }
}
