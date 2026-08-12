import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  AutonomousEngineeringExecution,
  EngineeringExecutionStep,
} from "./autonomous-engineering-execution";

export interface EngineeringWorkspace {
  id:
    ID;
  projectId:
    ID;
  rootPath:
    string;
  allowedPaths:
    string[];
  allowedLanguages:
    EngineeringLanguage[];
  allowedOperations:
    ToolchainOperation[];
  active:
    boolean;
}

export interface EngineeringWorkspaceRequest {
  id:
    ID;
  projectId:
    ID;
  rootPath:
    string;
  allowedPaths:
    string[];
  allowedLanguages:
    EngineeringLanguage[];
  allowedOperations:
    ToolchainOperation[];
}

export interface EngineeringCommand {
  id:
    ID;
  executionStepId:
    ID;
  projectId:
    ID;
  language:
    EngineeringLanguage;
  operation:
    ToolchainOperation;
  workingDirectory:
    string;
  allowed:
    boolean;
  reason?:
    string;
}

export class EngineeringWorkspaceAuthority {
  create(
    request:
      EngineeringWorkspaceRequest,
  ):
    EngineeringWorkspace {
    if (
      !request.rootPath.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Workspace: root path is required",
      );
    }

    if (
      request.allowedPaths.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Workspace: at least one allowed path is required",
      );
    }

    return {
      id:
        request.id,
      projectId:
        request.projectId,
      rootPath:
        request.rootPath,
      allowedPaths: [
        ...request.allowedPaths,
      ],
      allowedLanguages: [
        ...request.allowedLanguages,
      ],
      allowedOperations: [
        ...request.allowedOperations,
      ],
      active:
        true,
    };
  }

  authorizeStep(
    workspace:
      EngineeringWorkspace,
    execution:
      AutonomousEngineeringExecution,
    step:
      EngineeringExecutionStep,
  ):
    EngineeringCommand {
    if (
      !workspace.active
    ) {
      return this.denied(
        workspace,
        execution,
        step,
        "Engineering workspace is inactive.",
      );
    }

    if (
      execution.status ===
      "blocked"
    ) {
      return this.denied(
        workspace,
        execution,
        step,
        "Engineering execution is blocked.",
      );
    }

    if (
      execution.currentStepId !==
      step.id
    ) {
      return this.denied(
        workspace,
        execution,
        step,
        "Engineering step is not the current governed step.",
      );
    }

    if (
      !workspace.allowedLanguages.includes(
        step.language,
      )
    ) {
      return this.denied(
        workspace,
        execution,
        step,
        `Language "${step.language}" is not authorized for this workspace.`,
      );
    }

    if (
      !workspace.allowedOperations.includes(
        step.operation,
      )
    ) {
      return this.denied(
        workspace,
        execution,
        step,
        `Operation "${step.operation}" is not authorized for this workspace.`,
      );
    }

    return {
      id:
        `command-${step.id}`,
      executionStepId:
        step.id,
      projectId:
        workspace.projectId,
      language:
        step.language,
      operation:
        step.operation,
      workingDirectory:
        workspace.rootPath,
      allowed:
        true,
    };
  }

  private denied(
    workspace:
      EngineeringWorkspace,
    execution:
      AutonomousEngineeringExecution,
    step:
      EngineeringExecutionStep,
    reason:
      string,
  ):
    EngineeringCommand {
    return {
      id:
        `command-${step.id}`,
      executionStepId:
        step.id,
      projectId:
        workspace.projectId,
      language:
        step.language,
      operation:
        step.operation,
      workingDirectory:
        workspace.rootPath,
      allowed:
        false,
      reason,
    };
  }
}
