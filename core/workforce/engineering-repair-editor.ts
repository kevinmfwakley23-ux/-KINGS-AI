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

interface EngineeringRepairSnapshot {
  path:
    string;
  existed:
    boolean;
  content?:
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
    this.assertEdit(
      step,
      edit,
    );

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

  /**
   * Applies a bounded group of already-governed edits as one rollback-safe unit.
   * Every target is authorized and snapshotted before the first write. If a
   * later write fails, earlier replacements are restored and newly-created
   * files are removed through the same ControlledFileEditor policy boundary.
   */
  async executeBatch(
    step:
      EngineeringRepairStep,
    edits:
      EngineeringRepairEdit[],
  ):
    Promise<EngineeringRepairEditResult[]> {
    if (
      edits.length ===
      0
    ) {
      return [];
    }

    const normalizedPaths =
      new Set<string>();

    for (
      const edit of
      edits
    ) {
      this.assertEdit(
        step,
        edit,
      );

      const path =
        this.editor.authorizeWrite({
          path:
            edit.path,
          content:
            edit.content,
        });

      this.editor.authorizeDelete({
        path,
      });

      this.editor.authorizeRead({
        path,
      });

      if (
        normalizedPaths.has(
          path,
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Engineering Repair Editor: duplicate batch edit path "${path}"`,
        );
      }

      normalizedPaths.add(
        path,
      );
    }

    const snapshots:
      EngineeringRepairSnapshot[] = [];

    for (
      const edit of
      edits
    ) {
      const existed =
        await this.editor.exists({
          path:
            edit.path,
        });

      if (
        existed
      ) {
        const original =
          await this.editor.read({
            path:
              edit.path,
          });

        snapshots.push({
          path:
            original.path,
          existed:
            true,
          content:
            original.content,
        });
      } else {
        snapshots.push({
          path:
            this.editor.authorizeWrite({
              path:
                edit.path,
              content:
                edit.content,
            }),
          existed:
            false,
        });
      }
    }

    const results:
      EngineeringRepairEditResult[] = [];

    try {
      for (
        const edit of
        edits
      ) {
        results.push(
          await this.execute(
            step,
            edit,
          ),
        );
      }

      return results;
    } catch (
      error
    ) {
      const rollbackErrors:
        string[] = [];

      for (
        let index =
          results.length - 1;
        index >= 0;
        index -= 1
      ) {
        const snapshot =
          snapshots[index];

        if (
          !snapshot
        ) {
          continue;
        }

        try {
          if (
            snapshot.existed
          ) {
            await this.editor.write({
              path:
                snapshot.path,
              content:
                snapshot.content ??
                "",
            });
          } else {
            await this.editor.delete({
              path:
                snapshot.path,
            });
          }
        } catch (
          rollbackError
        ) {
          rollbackErrors.push(
            rollbackError instanceof Error
              ? rollbackError.message
              : String(
                  rollbackError,
                ),
          );
        }
      }

      const cause =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      if (
        rollbackErrors.length >
        0
      ) {
        throw new Error(
          `K.I.N.G.S. Engineering Repair Editor: batch edit failed (${cause}) and rollback was incomplete: ${rollbackErrors.join(" | ")}`,
        );
      }

      throw new Error(
        `K.I.N.G.S. Engineering Repair Editor: batch edit failed and all completed writes were rolled back: ${cause}`,
      );
    }
  }

  private assertEdit(
    step:
      EngineeringRepairStep,
    edit:
      EngineeringRepairEdit,
  ):
    void {
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
  }
}
