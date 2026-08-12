import type {
  ID,
} from "./types";

import type {
  SourceInspectionResult,
} from "./source-inspection";

export type RepositoryEntryKind =
  | "file"
  | "directory";

export interface RepositoryIndexEntry {
  path: string;
  kind: RepositoryEntryKind;
  sizeBytes: number;
  extension: string;
  language?: string;
  contentHash?: string;
  sourceId: ID;
}

export interface RepositoryIndexSnapshot {
  id: ID;
  sourceId: ID;
  root: string;
  entries: RepositoryIndexEntry[];
  indexedAt: string;
  snapshotHash: string;
}

export interface RepositoryIndexQuery {
  path?: string;
  extension?: string;
  language?: string;
  kind?: RepositoryEntryKind;
  limit?: number;
}

export class RepositoryIndexBuilder {
  build(
    id: ID,
    sourceId: ID,
    root: string,
    inspections: SourceInspectionResult[],
    indexedAt = new Date().toISOString(),
  ): RepositoryIndexSnapshot {
    if (!id.trim()) {
      throw new Error(
        "K.I.N.G.S. Repository Index: index id is required",
      );
    }

    if (!sourceId.trim()) {
      throw new Error(
        "K.I.N.G.S. Repository Index: source id is required",
      );
    }

    if (!root.trim()) {
      throw new Error(
        "K.I.N.G.S. Repository Index: repository root is required",
      );
    }

    const entries = inspections
      .map((inspection) =>
        this.toEntry(
          sourceId,
          inspection,
        ),
      )
      .sort(
        (a, b) =>
          this.comparePaths(
            a.path,
            b.path,
          ),
      );

    const seen =
      new Set<string>();

    for (const entry of entries) {
      if (seen.has(entry.path)) {
        throw new Error(
          `K.I.N.G.S. Repository Index: duplicate repository path "${entry.path}"`,
        );
      }

      seen.add(entry.path);
    }

    return {
      id,
      sourceId,
      root,
      entries,
      indexedAt,
      snapshotHash:
        this.snapshotHash(
          sourceId,
          root,
          entries,
        ),
    };
  }

  private toEntry(
    sourceId: ID,
    inspection: SourceInspectionResult,
  ): RepositoryIndexEntry {
    const normalizedPath =
      inspection.path
        .replaceAll("\\", "/")
        .replace(/^\.\/+/, "");

    if (
      !normalizedPath ||
      normalizedPath.startsWith("/") ||
      normalizedPath
        .split("/")
        .includes("..")
    ) {
      throw new Error(
        `K.I.N.G.S. Repository Index: invalid repository path "${inspection.path}"`,
      );
    }

    const extension =
      this.extensionOf(
        normalizedPath,
      );

    return {
      path: normalizedPath,
      kind: "file",
      sizeBytes:
        inspection.sizeBytes,
      extension,
      language:
        this.languageForExtension(
          extension,
        ),
      sourceId,
    };
  }

  private snapshotHash(
    sourceId: ID,
    root: string,
    entries: RepositoryIndexEntry[],
  ): string {
    const canonical = [
      sourceId,
      root,
      ...entries.map(
        (entry) =>
          [
            entry.path,
            entry.kind,
            String(entry.sizeBytes),
            entry.extension,
            entry.language ?? "",
            entry.contentHash ?? "",
            entry.sourceId,
          ].join("|"),
      ),
    ].join("\n");

    let hash = 2166136261;

    for (
      let index = 0;
      index < canonical.length;
      index += 1
    ) {
      hash ^=
        canonical.charCodeAt(
          index,
        );

      hash =
        Math.imul(
          hash,
          16777619,
        );
    }

    return (
      hash >>> 0
    )
      .toString(16)
      .padStart(
        8,
        "0",
      );
  }

  private extensionOf(
    path: string,
  ): string {
    const fileName =
      path.split("/").pop() ?? "";

    const dot =
      fileName.lastIndexOf(".");

    if (
      dot <= 0 ||
      dot === fileName.length - 1
    ) {
      return "";
    }

    return fileName
      .slice(dot + 1)
      .toLowerCase();
  }

  private languageForExtension(
    extension: string,
  ): string | undefined {
    const languages: Record<
      string,
      string
    > = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      mjs: "javascript",
      cjs: "javascript",
      json: "json",
      md: "markdown",
      txt: "text",
      py: "python",
      rs: "rust",
      go: "go",
      java: "java",
      c: "c",
      h: "c",
      cpp: "cpp",
      hpp: "cpp",
      css: "css",
      html: "html",
      yaml: "yaml",
      yml: "yaml",
      sh: "shell",
      bash: "shell",
      sql: "sql",
    };

    return languages[extension];
  }

  private comparePaths(
    a: string,
    b: string,
  ): number {
    if (a === b) {
      return 0;
    }

    return a < b
      ? -1
      : 1;
  }
}

export class RepositoryIndex {
  private readonly entries:
    RepositoryIndexEntry[];

  constructor(
    private readonly index:
      RepositoryIndexSnapshot,
  ) {
    this.entries =
      index.entries.map(
        (entry) => ({
          ...entry,
        }),
      );
  }

  get metadata():
    RepositoryIndexSnapshot {
    return {
      ...this.index,
      entries:
        this.entries.map(
          (entry) => ({
            ...entry,
          }),
        ),
    };
  }

  find(
    query: RepositoryIndexQuery = {},
  ): RepositoryIndexEntry[] {
    if (
      query.limit !== undefined &&
      (
        !Number.isInteger(
          query.limit,
        ) ||
        query.limit < 0
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Repository Index: limit must be a non-negative integer",
      );
    }

    const normalizedPath =
      query.path
        ?.replaceAll("\\", "/")
        .replace(/^\.\/+/, "")
        .toLowerCase();

    const normalizedExtension =
      query.extension
        ?.replace(/^\./, "")
        .toLowerCase();

    const normalizedLanguage =
      query.language?.toLowerCase();

    const matches =
      this.entries
        .filter((entry) => {
          if (
            normalizedPath &&
            !entry.path
              .toLowerCase()
              .includes(
                normalizedPath,
              )
          ) {
            return false;
          }

          if (
            normalizedExtension &&
            entry.extension !==
              normalizedExtension
          ) {
            return false;
          }

          if (
            normalizedLanguage &&
            entry.language !==
              normalizedLanguage
          ) {
            return false;
          }

          if (
            query.kind &&
            entry.kind !==
              query.kind
          ) {
            return false;
          }

          return true;
        })
        .map((entry) => ({
          ...entry,
        }));

    if (
      query.limit === undefined
    ) {
      return matches;
    }

    return matches.slice(
      0,
      query.limit,
    );
  }

  get(
    path: string,
  ):
    | RepositoryIndexEntry
    | undefined {
    const normalized =
      path
        .replaceAll("\\", "/")
        .replace(/^\.\/+/, "")
        .toLowerCase();

    const entry =
      this.entries.find(
        (candidate) =>
          candidate.path
            .toLowerCase() ===
          normalized,
      );

    return entry
      ? {
          ...entry,
        }
      : undefined;
  }
}
