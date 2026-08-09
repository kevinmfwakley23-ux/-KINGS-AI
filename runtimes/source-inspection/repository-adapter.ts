import {
  readFile,
  realpath,
  stat,
} from "node:fs/promises";

import {
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

import type {
  KnowledgeSource,
} from "../../core/workforce/types";

import type {
  SourceInspectionRequest,
  SourceInspectionResult,
} from "../../core/workforce/source-inspection";

import type {
  SourceInspectionAdapter,
} from "../../core/workforce/source-inspection-adapter";

export class RepositorySourceInspectionAdapter
  implements SourceInspectionAdapter
{
  constructor(
    private readonly maxContentBytes = 64 * 1024,
  ) {}

  async inspect(
    source: KnowledgeSource,
    request: SourceInspectionRequest,
  ): Promise<SourceInspectionResult> {
    if (!request.relativePath) {
      throw new Error(
        "K.I.N.G.S. Repository Source Adapter: relative path is required",
      );
    }

    const repositoryRoot =
      resolve(source.location);

    const requestedPath =
      request.relativePath.replaceAll("\\", "/");

    if (
      isAbsolute(requestedPath) ||
      requestedPath.split("/").includes("..")
    ) {
      throw new Error(
        `K.I.N.G.S. Repository Source Adapter: invalid relative path "${request.relativePath}"`,
      );
    }

    const filePath =
      resolve(
        join(
          repositoryRoot,
          requestedPath,
        ),
      );

    const pathFromRoot =
      relative(
        repositoryRoot,
        filePath,
      );

    if (
      pathFromRoot === "" ||
      pathFromRoot.startsWith("..") ||
      isAbsolute(pathFromRoot)
    ) {
      throw new Error(
        `K.I.N.G.S. Repository Source Adapter: path escapes source location "${request.relativePath}"`,
      );
    }

    let realRepositoryRoot: string;
    let realFilePath: string;

    try {
      realRepositoryRoot =
        await realpath(
          repositoryRoot,
        );

      realFilePath =
        await realpath(
          filePath,
        );
    } catch {
      throw new Error(
        `K.I.N.G.S. Repository Source Adapter: source content "${request.relativePath}" not found`,
      );
    }

    const realPathFromRoot =
      relative(
        realRepositoryRoot,
        realFilePath,
      );

    if (
      realPathFromRoot === "" ||
      realPathFromRoot.startsWith("..") ||
      isAbsolute(realPathFromRoot)
    ) {
      throw new Error(
        `K.I.N.G.S. Repository Source Adapter: path escapes source location "${request.relativePath}"`,
      );
    }

    let fileStats;

    try {
      fileStats =
        await stat(
          realFilePath,
        );
    } catch {
      throw new Error(
        `K.I.N.G.S. Repository Source Adapter: source content "${request.relativePath}" not found`,
      );
    }

    if (!fileStats.isFile()) {
      throw new Error(
        `K.I.N.G.S. Repository Source Adapter: "${request.relativePath}" is not a file`,
      );
    }

    if (
      fileStats.size >
      this.maxContentBytes
    ) {
      throw new Error(
        `K.I.N.G.S. Repository Source Adapter: "${request.relativePath}" exceeds content limit`,
      );
    }

    const content =
      request.operation === "content"
        ? await readFile(
            realFilePath,
            "utf8",
          )
        : undefined;

    return {
      sourceId: source.id,
      operation: request.operation,
      path: realFilePath,
      content,
      sizeBytes: fileStats.size,
      createdAt:
        fileStats.birthtime.toISOString(),
    };
  }
}
