import type {
  ID,
} from "./types";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import {
  isWorkspacePathAuthorized,
} from "./workspace-path-authorization";

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

  /**
   * Optional absolute workspace root used to safely resolve model-generated
   * workspace-relative paths against absolute Work Unit authorization roots.
   */
  workspaceRoot?:
    string;
}

export class GovernedLocalCodingProposal {
  propose(
    input:
      GovernedCodingProposalInput,
    parser:
      LocalCodingProposalParser,
  ):
    LocalCodingChangeProposal {
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
        change.path.trim() ===
        ""
      ) {
        throw new Error(
          "K.I.N.G.S. Local Coding Proposal: file path is required.",
        );
      }

      if (
        !isWorkspacePathAuthorized({
          candidatePath:
            change.path,
          allowedPaths:
            input.allowedPaths,
          ...(input.workspaceRoot === undefined
            ? {}
            : {
                workspaceRoot:
                  input.workspaceRoot,
              }),
        })
      ) {
        throw new Error(
          `K.I.N.G.S. Local Coding Proposal: path "${change.path}" is outside the Work Unit authorization.`,
        );
      }

      if (
        change.content.trim() ===
        ""
      ) {
        throw new Error(
          `K.I.N.G.S. Local Coding Proposal: proposed content for "${change.path}" is empty.`,
        );
      }
    }

    return proposal;
  }
}
