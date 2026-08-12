import type {
  ID,
} from "./types";

import type {
  EngineeringRepairStep,
} from "./engineering-repair-planner";

import {
  ControlledFileEditor,
} from "./file-editor";

export interface EngineeringRepairEdit {
  stepId:
    ID;
  projectId:
    ID;
  path:
    string;
  content:
    string;
}

export interface EngineeringRepairEditResult {
  stepId:
    ID;
  projectId:
    ID;
  path:
    string;
  bytesWritten:
    number;
  success:
    boolean;
  output:
    string;
}

export class EngineeringRepairEditor {
  constructor(
    private readonly editor:
      ControlledFileEditor,
  ) {}

  async execute(
    step:
      EngineeringRepairStep,
    edit:
      EngineeringRepairEdit,
  ):
    Promise<EngineeringRepairEditResult> {
    if (
      step.strategy !==
      "edit"
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Repair Editor: step "${step.id}" is not an edit step`,
      );
    }

    if (
      step.id !==
      edit.stepId
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Repair Editor: edit instruction does not match repair step",
      );
    }

    if (
      !edit.projectId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Repair Editor: project id is required",
      );
    }

    if (
      !edit.path.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Repair Editor: file path is required",
      );
    }

    const result =
      await this.editor.write({
        path:
          edit.path,
        content:
          edit.content,
      });

    return {
      stepId:
        step.id,
      projectId:
        edit.projectId,
      path:
        result.path,
      bytesWritten:
        result.bytesWritten,
      success:
        true,
      output:
        `Applied governed repair edit to ${result.path} (${result.bytesWritten} bytes).`,
    };
  }
}
