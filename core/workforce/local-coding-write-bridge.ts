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

import type {
  EngineeringWorkspaceProposalResult,
} from "./engineering-workspace-proposal";

export interface LocalCodingWriteRequest {
  step:
    EngineeringRepairStep;

  projectId:
    ID;

  workspaceRoot:
    string;

  proposal:
    EngineeringWorkspaceProposalResult;
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

    const writes:
      {
        path:
          string;
        bytesWritten:
          number;
      }[] = [];

    for (
      const change of
      request.proposal.changes
    ) {
      const absolutePath =
        resolve(
          request.workspaceRoot,
          change.path,
        );

      const edit:
        EngineeringRepairEdit = {
        stepId:
          request.step.id,
        projectId:
          request.projectId,
        path:
          absolutePath,
        content:
          change.content,
      };

      const result =
        await this.editor.execute(
          request.step,
          edit,
        );

      if (
        !result.success
      ) {
        throw new Error(
          `K.I.N.G.S. Local Coding Write Bridge: governed write failed for "${absolutePath}".`,
        );
      }

      writes.push({
        path:
          result.path,
        bytesWritten:
          result.bytesWritten,
      });
    }

    return {
      stepId:
        request.step.id,
      projectId:
        request.projectId,
      writes,
    };
  }
}
