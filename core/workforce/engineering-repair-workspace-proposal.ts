import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  EngineeringRepairStep,
} from "./engineering-repair-planner";

import type {
  EngineeringWorkspace,
} from "./engineering-workspace";

import type {
  LocalCodingChangeProposal,
  LocalCodingFileChange,
} from "./local-coding-change-proposal";

import type {
  AuthorizedLocalCodingWriteProposal,
} from "./local-coding-write-bridge";

export interface EngineeringRepairWorkspaceProposalRequest {
  step: EngineeringRepairStep;
  workspace: EngineeringWorkspace;
  proposal: LocalCodingChangeProposal;
}

export interface AuthorizedEngineeringRepairFileChange {
  path: string;
  operation: "create" | "replace";
  content: string;
  language: EngineeringLanguage;
}

export interface EngineeringRepairWorkspaceProposalResult
  extends AuthorizedLocalCodingWriteProposal {
  projectId: string;
  workspaceId: string;
  changes: AuthorizedEngineeringRepairFileChange[];
}

/**
 * Final relative-path/language/operation authorization for a model-generated
 * repair proposal before it reaches the filesystem editor. The earlier strict
 * parser proves shape and the exact repair allow-list; this authority proves the
 * same changes still fit the active EngineeringWorkspace policy.
 */
export class EngineeringRepairWorkspaceProposalAuthority {
  authorize(
    request: EngineeringRepairWorkspaceProposalRequest,
  ): EngineeringRepairWorkspaceProposalResult {
    if (request.step.strategy !== "edit") {
      throw new Error(
        `K.I.N.G.S. Engineering Repair Workspace Proposal: step "${request.step.id}" is not an edit step.`,
      );
    }
    if (!request.workspace.active) {
      throw new Error(
        "K.I.N.G.S. Engineering Repair Workspace Proposal: engineering workspace is inactive.",
      );
    }
    if (request.proposal.taskId !== request.step.id) {
      throw new Error(
        "K.I.N.G.S. Engineering Repair Workspace Proposal: proposal task does not match the governed repair step.",
      );
    }
    if (request.proposal.missionId !== request.workspace.projectId) {
      throw new Error(
        "K.I.N.G.S. Engineering Repair Workspace Proposal: proposal mission does not match workspace project.",
      );
    }
    if (!request.proposal.changes.length) {
      throw new Error(
        "K.I.N.G.S. Engineering Repair Workspace Proposal: at least one governed file change is required.",
      );
    }

    const paths = new Set<string>();
    const changes = request.proposal.changes.map((change) => {
      const authorized = this.authorizeChange(change, request.workspace);
      if (paths.has(authorized.path)) {
        throw new Error(
          `K.I.N.G.S. Engineering Repair Workspace Proposal: duplicate path "${authorized.path}".`,
        );
      }
      paths.add(authorized.path);
      return authorized;
    });

    return {
      taskId: request.proposal.taskId,
      missionId: request.proposal.missionId,
      projectId: request.workspace.projectId,
      workspaceId: request.workspace.id,
      changes,
    };
  }

  private authorizeChange(
    change: LocalCodingFileChange,
    workspace: EngineeringWorkspace,
  ): AuthorizedEngineeringRepairFileChange {
    const path = normalizePath(change.path);
    if (!path) {
      throw new Error(
        "K.I.N.G.S. Engineering Repair Workspace Proposal: file path is required.",
      );
    }
    if (
      !workspace.allowedPaths.some((allowedPath) =>
        isWithinPath(path, allowedPath),
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Repair Workspace Proposal: path "${path}" is outside the authorized workspace.`,
      );
    }

    const operation = change.operation as ToolchainOperation;
    if (!workspace.allowedOperations.includes(operation)) {
      throw new Error(
        `K.I.N.G.S. Engineering Repair Workspace Proposal: operation "${change.operation}" is not authorized for this workspace.`,
      );
    }

    const language = inferLanguage(path);
    if (!language) {
      throw new Error(
        `K.I.N.G.S. Engineering Repair Workspace Proposal: language could not be determined for "${path}".`,
      );
    }
    if (!workspace.allowedLanguages.includes(language)) {
      throw new Error(
        `K.I.N.G.S. Engineering Repair Workspace Proposal: language "${language}" is not authorized for "${path}".`,
      );
    }
    if (!change.content.trim()) {
      throw new Error(
        `K.I.N.G.S. Engineering Repair Workspace Proposal: content for "${path}" is empty.`,
      );
    }

    return {
      path,
      operation: change.operation,
      content: change.content,
      language,
    };
  }
}

function normalizePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/u, "")
    .replace(/\/{2,}/gu, "/")
    .trim();
}

function isWithinPath(path: string, allowedPath: string): boolean {
  const candidate = normalizePath(path);
  const root = normalizePath(allowedPath);
  return candidate === root || candidate.startsWith(`${root}/`);
}

function inferLanguage(path: string): EngineeringLanguage | undefined {
  const normalized = normalizePath(path).toLowerCase();
  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) return "typescript";
  if (normalized.endsWith(".js") || normalized.endsWith(".jsx") || normalized.endsWith(".mjs") || normalized.endsWith(".cjs")) return "javascript";
  if (normalized.endsWith(".py")) return "python";
  if (normalized.endsWith(".rs")) return "rust";
  if (normalized.endsWith(".go")) return "go";
  if (normalized.endsWith(".java")) return "java";
  if (normalized.endsWith(".c") || normalized.endsWith(".h")) return "c";
  if (normalized.endsWith(".cpp") || normalized.endsWith(".hpp")) return "cpp";
  if (normalized.endsWith(".css")) return "css";
  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) return "html";
  if (normalized.endsWith(".sql")) return "sql";
  if (normalized.endsWith(".sh") || normalized.endsWith(".bash")) return "shell";
  return undefined;
}
