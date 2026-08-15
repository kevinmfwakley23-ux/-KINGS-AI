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

interface SingleFileModelProposal {
  taskId: ID;
  missionId: ID;
  summary: string;
  path: string;
  operation:
    "create" |
    "replace";
  content: string;
}

function normalizeSingleFileProposal(
  value: unknown,
): LocalCodingChangeProposal {
  if (
    !value ||
    typeof value !== "object"
  ) {
    throw new Error(
      "K.I.N.G.S. Local Coding Proposal: model proposal must be an object.",
    );
  }

  const candidate =
    value as Record<string, unknown>;

  if (
    typeof candidate.taskId !== "string" ||
    typeof candidate.missionId !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.path !== "string" ||
    typeof candidate.operation !== "string" ||
    typeof candidate.content !== "string"
  ) {
    throw new Error(
      "K.I.N.G.S. Local Coding Proposal: model proposal must contain taskId, missionId, summary, path, operation, and content strings.",
    );
  }

  const operation =
    candidate.operation
      .trim()
      .toLowerCase()
      .match(
        /\b(create|replace)\b/i,
      )?.[1]
      ?.toLowerCase();

  if (
    operation !== "create" &&
    operation !== "replace"
  ) {
    throw new Error(
      `K.I.N.G.S. Local Coding Proposal: invalid operation "${candidate.operation}".`,
    );
  }

  if (
    candidate.taskId.trim() === "" ||
    candidate.missionId.trim() === "" ||
    candidate.path.trim() === "" ||
    candidate.content.trim() === ""
  ) {
    throw new Error(
      "K.I.N.G.S. Local Coding Proposal: model proposal contains an empty required field.",
    );
  }

  return {
    id:
      `proposal-${candidate.taskId}`,
    taskId:
      candidate.taskId,
    missionId:
      candidate.missionId,
    summary:
      candidate.summary,
    changes: [
      {
        path:
          candidate.path,
        operation:
          operation as
            "create" |
            "replace",
        content:
          candidate.content,
      },
    ],
  };
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

    const allowed =
      new Set(
        input.allowedPaths,
      );

    for (
      const change of
      proposal.changes
    ) {
      if (
        !allowed.has(
          change.path,
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Local Coding Proposal: path "${change.path}" is outside the Work Unit authorization.`,
        );
      }

      if (
        change.path.trim() ===
        ""
      ) {
        throw new Error(
          "K.I.N.G.S. Local Coding Proposal: file path is required.",
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
