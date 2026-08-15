import {
  readdir,
  stat,
} from "node:fs/promises";

import {
  join,
  relative,
  resolve,
} from "node:path";

export interface RepositoryContextEntry {
  path: string;
  kind: "file" | "directory";
  bytes: number;
}

export interface RepositoryContextResult {
  root: string;
  entries: RepositoryContextEntry[];
  summary: string;
}

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
]);

const MAX_ENTRIES = 400;

async function walk(
  root: string,
  current: string,
  entries: RepositoryContextEntry[],
): Promise<void> {
  if (
    entries.length >= MAX_ENTRIES
  ) {
    return;
  }

  const directoryEntries =
    await readdir(
      current,
      {
        withFileTypes: true,
      },
    );

  for (
    const entry of
    directoryEntries
  ) {
    if (
      entries.length >= MAX_ENTRIES
    ) {
      return;
    }

    const fullPath =
      join(
        current,
        entry.name,
      );

    if (
      entry.isDirectory() &&
      IGNORED_DIRECTORIES.has(
        entry.name,
      )
    ) {
      continue;
    }

    const relativePath =
      relative(
        root,
        fullPath,
      );

    if (
      entry.isDirectory()
    ) {
      entries.push({
        path:
          relativePath,
        kind:
          "directory",
        bytes:
          0,
      });

      await walk(
        root,
        fullPath,
        entries,
      );

      continue;
    }

    const fileStat =
      await stat(
        fullPath,
      );

    entries.push({
      path:
        relativePath,
      kind:
        "file",
      bytes:
        fileStat.size,
    });
  }
}

export class RepositoryContextBuilder {
  async build(
    rootPath: string,
  ): Promise<RepositoryContextResult> {
    const root =
      resolve(
        rootPath,
      );

    const entries:
      RepositoryContextEntry[] = [];

    await walk(
      root,
      root,
      entries,
    );

    entries.sort(
      (
        left,
        right,
      ) =>
        left.path.localeCompare(
          right.path,
        ),
    );

    const files =
      entries.filter(
        (
          entry,
        ) =>
          entry.kind ===
          "file",
      ).length;

    const directories =
      entries.filter(
        (
          entry,
        ) =>
          entry.kind ===
          "directory",
      ).length;

    return {
      root,
      entries,
      summary:
        `Repository contains ${files} files and ${directories} directories.`,
    };
  }
}
