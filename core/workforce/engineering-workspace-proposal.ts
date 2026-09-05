import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
} from "./engineering-toolchain";

import type {
  AutonomousEngineeringExecution,
  EngineeringExecutionStep,
} from "./autonomous-engineering-execution";

import {
  EngineeringWorkspaceAuthority,
  type EngineeringWorkspace,
  type EngineeringCommand,
} from "./engineering-workspace";

import type {
  LocalCodingChangeProposal,
  LocalCodingFileChange,
} from "./local-coding-change-proposal";

import {
  isWorkspacePathAuthorized,
} from "./workspace-path-authorization";

export interface EngineeringWorkspaceProposalRequest {
  execution:
    AutonomousEngineeringExecution;

  step:
    EngineeringExecutionStep;

  workspace:
    EngineeringWorkspace;

  proposal:
    LocalCodingChangeProposal;
}

export interface AuthorizedEngineeringFileChange {
  path:
    string;

  operation:
    "create"
    | "replace";

  content:
    string;

  language:
    EngineeringLanguage;
}

export interface EngineeringWorkspaceProposalResult {
  command:
    EngineeringCommand;

  taskId:
    ID;

  missionId:
    ID;

  changes:
    AuthorizedEngineeringFileChange[];
}

function normalizePath(
  value:
    string,
):
  string {
  return value
    .replace(
      /\\/g,
      "/",
    )
    .replace(
      /^\.\/+/,
      "",
    )
    .replace(
      /\/+/g,
      "/",
    )
    .trim();
}

function inferLanguage(
  path:
    string,
):
  EngineeringLanguage
  | undefined {
  const normalized =
    normalizePath(
      path,
    );

  if (
    normalized.endsWith(
      ".ts",
    ) ||
    normalized.endsWith(
      ".tsx",
    )
  ) {
    return "typescript";
  }

  if (
    normalized.endsWith(
      ".js",
    ) ||
    normalized.endsWith(
      ".jsx",
    )
  ) {
    return "javascript";
  }

  if (
    normalized.endsWith(
      ".py",
    )
  ) {
    return "python";
  }

  if (
    normalized.endsWith(
      ".rs",
    )
  ) {
    return "rust";
  }

  if (
    normalized.endsWith(
      ".go",
    )
  ) {
    return "go";
  }

  if (
    normalized.endsWith(
      ".java",
    )
  ) {
    return "java";
  }

  if (
    normalized.endsWith(
      ".c",
    ) ||
    normalized.endsWith(
      ".h",
    )
  ) {
    return "c";
  }

  if (
    normalized.endsWith(
      ".cpp",
    ) ||
    normalized.endsWith(
      ".hpp",
    )
  ) {
    return "cpp";
  }

  if (
    normalized.endsWith(
      ".css",
    )
  ) {
    return "css";
  }

  if (
    normalized.endsWith(
      ".html",
    ) ||
    normalized.endsWith(
      ".htm",
    )
  ) {
    return "html";
  }

  if (
    normalized.endsWith(
      ".sql",
    )
  ) {
    return "sql";
  }

  if (
    normalized.endsWith(
      ".sh",
    ) ||
    normalized.endsWith(
      ".bash",
    )
  ) {
    return "shell";
  }

  return undefined;
}

export class EngineeringWorkspaceProposalAuthority {
  constructor(
    private readonly workspaceAuthority:
      EngineeringWorkspaceAuthority,
  ) {}

  authorize(
    request:
      EngineeringWorkspaceProposalRequest,
  ):
    EngineeringWorkspaceProposalResult {
    if (
      request.proposal.taskId !==
      request.step.id
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Workspace Proposal: proposal task must match the governed engineering step.",
      );
    }

    if (
      request.proposal.missionId !==
      request.execution.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Workspace Proposal: proposal mission does not match engineering project.",
      );
    }

    const command =
      this.workspaceAuthority.authorizeStep(
        request.workspace,
        request.execution,
        request.step,
      );

    if (
      !command.allowed
    ) {
      throw new Error(
        command.reason ??
          "K.I.N.G.S. Engineering Workspace Proposal: engineering command denied.",
      );
    }

    const changes =
      request.proposal.changes.map(
        (
          change,
        ) =>
          this.authorizeChange(
            change,
            request,
          ),
      );

    return {
      command,
      taskId:
        request.proposal.taskId,
      missionId:
        request.proposal.missionId,
      changes,
    };
  }

  private authorizeChange(
    change:
      LocalCodingFileChange,
    request:
      EngineeringWorkspaceProposalRequest,
  ):
    AuthorizedEngineeringFileChange {
    const normalizedPath =
      normalizePath(
        change.path,
      );

    if (
      !normalizedPath
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Workspace Proposal: file path is required.",
      );
    }

    if (
      !isWorkspacePathAuthorized({
        candidatePath:
          normalizedPath,
        allowedPaths:
          request.workspace.allowedPaths,
        workspaceRoot:
          request.workspace.rootPath,
      })
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Workspace Proposal: path "${normalizedPath}" is outside the authorized workspace.`,
      );
    }

    const language =
      inferLanguage(
        normalizedPath,
      );

    if (
      !language
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Workspace Proposal: language could not be determined for "${normalizedPath}".`,
      );
    }

    if (
      !request.workspace.allowedLanguages.includes(
        language,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Workspace Proposal: language "${language}" is not authorized for "${normalizedPath}".`,
      );
    }

    if (
      change.content.trim() ===
      ""
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Workspace Proposal: content for "${normalizedPath}" is empty.`,
      );
    }

    return {
      path:
        normalizedPath,
      operation:
        change.operation,
      content:
        change.content,
      language,
    };
  }
}
