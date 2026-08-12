import type {
  ID,
} from "./types";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

import {
  ControlledFileEditor,
  type FileReadResult,
  type FileWriteResult,
} from "./file-editor";

export interface WorkUnitFileReadRequest {
  taskId:
    ID;
  path:
    string;
}

export interface WorkUnitFileWriteRequest {
  taskId:
    ID;
  path:
    string;
  content:
    string;
}

export interface WorkUnitFileEditorOptions {
  maxFileBytes:
    number;
}

export class WorkUnitFileEditor {
  private readonly editor:
    ControlledFileEditor;

  constructor(
    private readonly taskId:
      ID,
    private readonly workUnit:
      WorkUnitContract,
    options:
      WorkUnitFileEditorOptions,
  ) {
    if (
      !taskId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Work Unit File Editor: task id is required",
      );
    }

    if (
      !workUnit.id.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Work Unit File Editor: Work Unit id is required",
      );
    }

    if (
      !workUnit.approved
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit File Editor: Work Unit "${workUnit.id}" is not approved`,
      );
    }

    if (
      workUnit.allowedPaths.length ===
      0
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit File Editor: Work Unit "${workUnit.id}" has no authorized paths`,
      );
    }

    this.editor =
      new ControlledFileEditor({
        allowedReadPaths: [
          ...workUnit.allowedPaths,
        ],
        allowedWritePaths: [
          ...workUnit.allowedPaths,
        ],
        maxFileBytes:
          options.maxFileBytes,
      });
  }

  async read(
    request:
      WorkUnitFileReadRequest,
  ): Promise<FileReadResult> {
    this.assertTask(
      request.taskId,
    );

    return this.editor.read({
      path:
        request.path,
    });
  }

  async write(
    request:
      WorkUnitFileWriteRequest,
  ): Promise<FileWriteResult> {
    this.assertTask(
      request.taskId,
    );

    return this.editor.write({
      path:
        request.path,
      content:
        request.content,
    });
  }

  async exists(
    request:
      WorkUnitFileReadRequest,
  ): Promise<boolean> {
    this.assertTask(
      request.taskId,
    );

    return this.editor.exists({
      path:
        request.path,
    });
  }

  private assertTask(
    taskId:
      ID,
  ): void {
    if (
      !taskId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Work Unit File Editor: task id is required",
      );
    }

    if (
      taskId !==
      this.taskId
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit File Editor: task "${taskId}" is not authorized by Work Unit "${this.workUnit.id}"`,
      );
    }
  }
}
