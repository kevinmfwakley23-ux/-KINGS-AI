import type {
  ModelExecutionResult,
} from "./model-interface";

import type {
  LocalCodingChangeProposal,
  LocalCodingFileChange,
  LocalCodingProposalParser,
} from "./local-coding-change-proposal";

export interface ModelCodingProposalParserOptions {
  expectedTaskId: string;
  expectedMissionId: string;
  allowedPaths: readonly string[];
  expectedFilePaths?: readonly string[];
  allowMultipleFiles?: boolean;
}

function normalizePath(
  value: string,
): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function hasPathTraversal(
  value: string,
): boolean {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .some((segment) => segment === "..");
}

function isAbsolutePathLike(
  value: string,
): boolean {
  const normalized =
    value
      .replace(/\\/g, "/")
      .trim();

  return (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized)
  );
}

function isWithinAuthorizedPath(
  candidate: string,
  allowed: string,
): boolean {
  const normalizedCandidate =
    normalizePath(candidate);
  const normalizedAllowed =
    normalizePath(allowed);

  if (
    !normalizedCandidate ||
    normalizedCandidate === "." ||
    isAbsolutePathLike(candidate) ||
    hasPathTraversal(candidate) ||
    isAbsolutePathLike(allowed) ||
    hasPathTraversal(allowed)
  ) {
    return false;
  }

  if (normalizedAllowed === ".") {
    return true;
  }

  return (
    normalizedCandidate ===
      normalizedAllowed ||
    normalizedCandidate.startsWith(
      `${normalizedAllowed}/`,
    )
  );
}

export class ModelCodingProposalParser
  implements LocalCodingProposalParser {
  constructor(
    private readonly options: ModelCodingProposalParserOptions,
  ) {}

  parse(
    response: ModelExecutionResult,
  ): LocalCodingChangeProposal {
    if (
      !response.success ||
      !response.response
    ) {
      throw new Error(
        "K.I.N.G.S. Model Coding Proposal Parser: model response was not successful.",
      );
    }

    const content =
      response.response.content.trim();

    if (!content) {
      throw new Error(
        "K.I.N.G.S. Model Coding Proposal Parser: model response was empty.",
      );
    }

    const normalized =
      content
        .replace(/\r\n/g, "\n")
        .trim();

    const blocks =
      this.extractFileBlocks(normalized);

    if (blocks.length === 0) {
      throw new Error(
        "K.I.N.G.S. Model Coding Proposal Parser: response must contain at least one FILE block.",
      );
    }

    if (
      !this.options.allowMultipleFiles &&
      blocks.length !== 1
    ) {
      throw new Error(
        "K.I.N.G.S. Model Coding Proposal Parser: multiple file blocks are not authorized for this Work Unit.",
      );
    }

    const expected =
      this.options.expectedFilePaths ?? [];

    if (expected.length > 0) {
      const actual =
        new Set(
          blocks.map(
            (block) =>
              normalizePath(block.path),
          ),
        );

      for (const path of expected) {
        const normalizedPath =
          normalizePath(path);

        if (!actual.has(normalizedPath)) {
          throw new Error(
            `K.I.N.G.S. Model Coding Proposal Parser: expected file "${path}" was not returned by the model.`,
          );
        }
      }
    }

    const changes:
      LocalCodingFileChange[] =
      blocks.map(
        (block) => ({
          path: normalizePath(block.path),
          operation: block.operation,
          content: block.content,
        }),
      );

    return {
      id:
        `model-proposal-${response.response.requestId}`,
      taskId:
        this.options.expectedTaskId,
      missionId:
        this.options.expectedMissionId,
      summary:
        `Generated ${changes.length} authorized coding change${changes.length === 1 ? "" : "s"} from model response.`,
      changes,
    };
  }

  private extractFileBlocks(
    content: string,
  ): Array<{
    path: string;
    operation: "create" | "replace";
    content: string;
  }> {
    const blocks: Array<{
      path: string;
      operation: "create" | "replace";
      content: string;
    }> = [];

    const lines =
      content.split("\n");

    let current:
      {
        path: string;
        operation: "create" | "replace";
        content: string[];
      } | undefined;

    const flush = () => {
      if (!current) {
        return;
      }

      const fileContent =
        current.content
          .join("\n")
          .replace(
            /^```(?:typescript|javascript|tsx|jsx|ts|js)?\s*\n?/i,
            "",
          )
          .replace(
            /\n?```\s*$/i,
            "",
          )
          .trim();

      if (!current.path.trim()) {
        throw new Error(
          "K.I.N.G.S. Model Coding Proposal Parser: FILE block path is empty.",
        );
      }

      if (!fileContent) {
        throw new Error(
          `K.I.N.G.S. Model Coding Proposal Parser: FILE block "${current.path}" contains no code.`,
        );
      }

      blocks.push({
        path:
          normalizePath(current.path),
        operation:
          current.operation,
        content:
          fileContent,
      });

      current = undefined;
    };

    for (const line of lines) {
      const header =
        /^FILE:\s+(.+?)(?:\s+\[(create|replace)\])?\s*$/i.exec(
          line.trim(),
        );

      if (header) {
        flush();

        current = {
          path:
            header[1].trim(),
          operation:
            (header[2]?.toLowerCase() as
              | "create"
              | "replace"
              | undefined) ??
            "create",
          content: [],
        };

        continue;
      }

      if (current) {
        current.content.push(line);
      } else if (line.trim() !== "") {
        throw new Error(
          "K.I.N.G.S. Model Coding Proposal Parser: response contains text outside an authorized FILE block.",
        );
      }
    }

    flush();

    const unauthorized =
      blocks.find(
        (block) =>
          !this.options.allowedPaths.some(
            (allowedPath) =>
              isWithinAuthorizedPath(
                block.path,
                allowedPath,
              ),
          ),
      );

    if (unauthorized) {
      throw new Error(
        `K.I.N.G.S. Model Coding Proposal Parser: model proposed unauthorized path "${unauthorized.path}".`,
      );
    }

    const duplicatePaths =
      blocks
        .map(
          (block) => block.path,
        )
        .filter(
          (path, index, paths) =>
            paths.indexOf(path) !== index,
        );

    if (duplicatePaths.length > 0) {
      throw new Error(
        `K.I.N.G.S. Model Coding Proposal Parser: duplicate file proposal "${duplicatePaths[0]}".`,
      );
    }

    return blocks;
  }
}
