import type {
  ID,
} from "./types";

export interface MultiFileChange {
  path: string;
  operation:
    "create" |
    "replace";
  content: string;
}

export interface MultiFileCodingProposal {
  id: ID;
  taskId: ID;
  missionId: ID;
  summary: string;
  changes: MultiFileChange[];
}

export function validateMultiFileProposal(
  proposal:
    MultiFileCodingProposal,
  taskId: ID,
  missionId: ID,
  allowedPaths:
    readonly string[],
): MultiFileCodingProposal {
  if (
    proposal.taskId !==
    taskId
  ) {
    throw new Error(
      "K.I.N.G.S. Multi-File Proposal: task identity mismatch.",
    );
  }

  if (
    proposal.missionId !==
    missionId
  ) {
    throw new Error(
      "K.I.N.G.S. Multi-File Proposal: mission identity mismatch.",
    );
  }

  if (
    proposal.changes.length <
    2
  ) {
    throw new Error(
      "K.I.N.G.S. Multi-File Proposal: at least two changes are required.",
    );
  }

  const allowed =
    new Set(
      allowedPaths,
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
        `K.I.N.G.S. Multi-File Proposal: unauthorized path "${change.path}".`,
      );
    }

    if (
      change.content.trim()
        .length ===
      0
    ) {
      throw new Error(
        `K.I.N.G.S. Multi-File Proposal: empty content for "${change.path}".`,
      );
    }

    if (
      change.operation !==
        "create" &&
      change.operation !==
        "replace"
    ) {
      throw new Error(
        `K.I.N.G.S. Multi-File Proposal: invalid operation "${change.operation}".`,
      );
    }
  }

  return proposal;
}
