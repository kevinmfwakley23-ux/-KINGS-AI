import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ControlledFileEditor } from "./file-editor";
import { EngineeringRepairEditor } from "./engineering-repair-editor";
import type { EngineeringRepairStep } from "./engineering-repair-planner";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-tree-0835-"));
  const target = join(root, "repair-target.ts");
  await writeFile(target, "export const value = 1;\n", "utf8");

  const editor = new ControlledFileEditor({
    allowedReadPaths: [root],
    allowedWritePaths: [root],
    maxFileBytes: 16_384,
  });
  const repairEditor = new EngineeringRepairEditor(editor);
  const editStep: EngineeringRepairStep = {
    id: "repair-step-tree-0835-edit",
    strategy: "edit",
    description: "Apply the verified repair.",
    reason: "The failure has been diagnosed.",
    required: true,
  };

  const result = await repairEditor.execute(editStep, {
    stepId: editStep.id,
    projectId: "project-tree-0835",
    path: target,
    content: "export const value = 2;\n",
  });

  assert(result.success, "Authorized edit must succeed.");
  assert(result.bytesWritten > 0, "Repair edit must report bytes written.");
  const content = await readFile(target, "utf8");
  assert(content === "export const value = 2;\n", "Real repair content must be written to the target file.");

  console.log("08.35 REAL FILE REPAIR: SUCCESS");
  console.log("08.35 CONTROLLED FILE AUTHORIZATION: SUCCESS");

  let unauthorizedFailed = false;
  try {
    await repairEditor.execute(editStep, {
      stepId: editStep.id,
      projectId: "project-tree-0835",
      path: join(tmpdir(), "not-authorized", "repair.ts"),
      content: "blocked",
    });
  } catch {
    unauthorizedFailed = true;
  }
  assert(unauthorizedFailed, "Repair edits outside the authorized workspace must be rejected.");
  console.log("08.35 UNAUTHORIZED EDIT BLOCKING: SUCCESS");

  let wrongStrategyFailed = false;
  try {
    await repairEditor.execute({ ...editStep, id: "repair-step-tree-0835-inspect", strategy: "inspect" }, {
      stepId: "repair-step-tree-0835-inspect",
      projectId: "project-tree-0835",
      path: target,
      content: "must not write",
    });
  } catch {
    wrongStrategyFailed = true;
  }
  assert(wrongStrategyFailed, "Non-edit repair steps must never perform file writes.");

  console.log("08.35 REPAIR STRATEGY BOUNDARY: SUCCESS");
  console.log("TREE-08.35 GOVERNED REAL REPAIR EDITOR: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
