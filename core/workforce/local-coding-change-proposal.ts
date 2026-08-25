import type {
  ID,
} from "./types";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

export interface LocalCodingFileChange {
  path:
    string;

  operation:
    "create"
    | "replace";

  content:
    string;
}

export interface LocalCodingChangeProposal {
  id:
    ID;

  taskId:
    ID;

  missionId:
    ID;

  summary:
    string;

  changes:
    LocalCodingFileChange[];
}

export interface LocalCodingProposalParser {
  parse(
    response:
      ModelExecutionResult,
  ):
    LocalCodingChangeProposal;
}

export interface GovernedCodingProposalInput {
  response:
    ModelExecutionResult;

  request:
    ModelExecutionRequest;

  allowedPaths:
    readonly string[];
}

function normalizePath(
  value:
    string,
): string {
  return value
    .replace(
      /\\/g,
      "/",
    )
    .replace(
      /\/+/g,
      "/",
    )
    .trim();
}

function hasPathTraversal(
  value:
    string,
): boolean {
  const normalized =
    value
      .replace(
        /\\/g,
        "/",
      );

  return normalized
    .split("/")
    .some(
      (segment) =>
        segment === "..",
    );
}

function isWithinAuthorizedPath(
  candidate:
    string,
  allowed:
    string,
): boolean {
  const normalizedCandidate =
    normalizePath(
      candidate,
    );

  const normalizedAllowed =
    normalizePath(
      allowed,
    );

  return (
    normalizedCandidate ===
      normalizedAllowed ||
    normalizedCandidate.startsWith(
      `${normalizedAllowed}/`,
    )
  );
}

export class GovernedLocalCodingProposal {
  propose(
    input:
      GovernedCodingProposalInput,
    parser:
      LocalCodingProposalParser,
  )
    : LocalCodingChangeProposal {
    if (
      !input.response.success ||
      !input.response.response
    ) {
      throw new Error(
        "K.I.N.G.S. Local Coding Proposal: model execution did not produce a successful response.",
      );
    }

    const proposal =
      parser.parse(
        input.response,
      );

    if (
      proposal.taskId !==
      input.request.taskId
    ) {
      throw new Error(
        "K.I.N.G.S. Local Coding Proposal: task identity mismatch.",
      );
    }

    if (
      proposal.missionId !==
      input.request.missionId
    ) {
      throw new Error(
        "K.I.N.G.S. Local Coding Proposal: mission identity mismatch.",
      );
    }

    for (
      const change of
      proposal.changes
    ) {
      if (
        hasPathTraversal(
          change.path,
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Local Coding Proposal: path traversal is not authorized for "${change.path}".`,
        );
      }

      const normalizedPath =
        normalizePath(
          change.path,
        );

      if (
        !normalizedPath
      ) {
        throw new Error(
          "K.I.N.G.S. Local Coding Proposal: file path is required.",
        );
      }

      if (
        !input.allowedPaths.some(
          (
            allowedPath,
          ) =>
            isWithinAuthorizedPath(
              normalizedPath,
              allowedPath,
            ),
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Local Coding Proposal: path "${normalizedPath}" is outside the Work Unit authorization.`,
        );
      }

      change.path =
        normalizedPath;

      if (
        change.content.trim() ===
        ""
      ) {
        throw new Error(
          `K.I.N.G.S. Local Coding Proposal: proposed content for "${normalizedPath}" is empty.`,
        );
      }
    }

    return proposal;
  }
}
