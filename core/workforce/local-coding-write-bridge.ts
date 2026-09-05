import {
  resolve,
} from "node:path";

import type {
  ID,
} from "./types";

import type {
  EngineeringRepairStep,
} from "./engineering-repair-planner";

import {
  EngineeringRepairEditor,
  type EngineeringRepairEdit,
} from "./engineering-repair-editor";

export interface AuthorizedLocalCodingWriteProposal {
  taskId:
    ID;

  missionId:
    ID;

  changes:
    readonly {
      path:
        string;
      operation:
        "create"
        | "replace";
      content:
        string;
    }[];
}

export interface LocalCodingWriteRequest {
  step:
    EngineeringRepairStep;

  projectId:
    ID;

  workspaceRoot:
    string;

  proposal:
    AuthorizedLocalCodingWriteProposal;
}

export interface LocalCodingWriteResult {
  stepId:
    ID;

  projectId:
    ID;

  writes:
    {
      path:
        string;
      bytesWritten:
        number;
    }[];
}

export class LocalCodingWriteBridge {
  constructor(
    private readonly editor:
      EngineeringRepairEditor,
  ) {}

  async execute(
    request:
      LocalCodingWriteRequest,
  ):
    Promise<
      LocalCodingWriteResult
    > {
    if (
      !request.projectId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Local Coding Write Bridge: project id is required.",
      );
    }

    if (
      !request.workspaceRoot.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Local Coding Write Bridge: workspace root is required.",
      );
    }

    if (
      request.proposal.missionId !==
      request.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Local Coding Write Bridge: proposal mission does not match project.",
      );
    }

    if (
      request.step.strategy !==
      "edit"
    ) {
      throw new Error(
        `K.I.N.G.S. Local Coding Write Bridge: repair step "${request.step.id}" is not an edit step.`,
      );
    }

    if (
      request.proposal.taskId !==
      request.step.id
    ) {
      throw new Error(
        "K.I.N.G.S. Local Coding Write Bridge: proposal task does not match the governed repair edit step.",
      );
    }

    const edits:
      EngineeringRepairEdit[] =
      request.proposal.changes.map(
        (
          change,
        ) => ({
          stepId:
            request.step.id,
          projectId:
            request.projectId,
          path:
            resolve(
              request.workspaceRoot,
              change.path,
            ),
          content:
            change.content,
        }),
      );

    const results =
      await this.editor.executeBatch(
        request.step,
        edits,
      );

    if (
      results.some(
        (
          result,
        ) =>
          !result.success,
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Local Coding Write Bridge: governed repair batch reported an unsuccessful write.",
      );
    }

    return {
      stepId:
        request.step.id,
      projectId:
        request.projectId,
      writes:
        results.map(
          (
            result,
          ) => ({
            path:
              result.path,
            bytesWritten:
              result.bytesWritten,
          }),
        ),
    };
  }
}
