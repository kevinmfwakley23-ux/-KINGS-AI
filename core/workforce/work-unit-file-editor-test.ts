import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkUnitFileEditor } from "./work-unit-file-editor";
import type { WorkUnitContract } from "./work-unit-contract";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-tree-064-"));
  const allowed = join(root, "workspace");
  const outside = join(root, "outside");

  const contract: WorkUnitContract = {
    id: "WORK-UNIT-mission-tree-064-task-tree-064",
    role: "Controlled coding worker",
    objective: "Modify only authorized repository files.",
    capabilityIds: ["coding"],
    allowedToolIds: [],
    allowedPaths: [allowed],
    budget: { maxTimeMs: 60_000, maxTokens: 10_000, maxIterations: 3 },
    dependencyIds: [],
    acceptanceCriteria: ["Authorized file is written."],
    requiredEvidenceTypes: ["test"],
    approved: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const editor = new WorkUnitFileEditor("task-tree-064", contract, { maxFileBytes: 4096 });
  const target = join(allowed, "src", "generated.ts");

  try {
    const write = await editor.write({
      taskId: "task-tree-064",
      path: target,
      content: "export const CONTROLLED_EDIT = true;\n",
    });
    assert(write.bytesWritten > 0, "Authorized Work Unit editing must write content.");

    const read = await editor.read({ taskId: "task-tree-064", path: target });
    assert(read.content.includes("CONTROLLED_EDIT"), "Authorized Work Unit editing must read the generated content.");

    let unauthorizedPathRejected = false;
    try {
      await editor.write({ taskId: "task-tree-064", path: join(outside, "blocked.ts"), content: "blocked" });
    } catch {
      unauthorizedPathRejected = true;
    }
    assert(unauthorizedPathRejected, "Work Unit editing must reject paths outside allowedPaths.");

    let wrongTaskRejected = false;
    try {
      await editor.write({ taskId: "different-task", path: target, content: "blocked" });
    } catch {
      wrongTaskRejected = true;
    }
    assert(wrongTaskRejected, "Work Unit editing must reject a task not authorized by the bound Work Unit.");

    let unapprovedRejected = false;
    try {
      new WorkUnitFileEditor("task-tree-064", { ...contract, approved: false }, { maxFileBytes: 4096 });
    } catch {
      unapprovedRejected = true;
    }
    assert(unapprovedRejected, "Unapproved Work Units must not receive editing authority.");

    console.log("06.4 Work Unit path binding: SUCCESS");
    console.log("06.4 controlled file write/read: SUCCESS");
    console.log("06.4 unauthorized path rejection: SUCCESS");
    console.log("06.4 task attribution boundary: SUCCESS");
    console.log("06.4 approval enforcement: SUCCESS");
    console.log("TREE-06.4 CONTROLLED EDITING: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
