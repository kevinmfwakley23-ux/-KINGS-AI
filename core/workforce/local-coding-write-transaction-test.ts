import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  ControlledFileEditor,
} from "./file-editor";

import {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import type {
  EngineeringRepairStep,
} from "./engineering-repair-planner";

import {
  LocalCodingWriteBridge,
} from "./local-coding-write-bridge";

import type {
  EngineeringWorkspaceProposalResult,
} from "./engineering-workspace-proposal";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const step: EngineeringRepairStep = {
  id: "repair-step-transaction",
  strategy: "edit",
  description: "Apply a bounded multi-file repair.",
  reason: "Transactional repair proof.",
  required: true,
};

async function main(): Promise<void> {
  await successfulBatchPersistsAllWrites();
  await failedBatchRemovesNewFiles();
  await failedBatchRestoresReplacedFiles();
  console.log("TREE-06 LOCAL CODING TRANSACTIONAL WRITE SAFETY: SUCCESS");
}

async function successfulBatchPersistsAllWrites(): Promise<void> {
  const root = await workspace("kings-write-transaction-success-");
  try {
    const bridge = createBridge(root, 1_000);
    const result = await bridge.execute({
      step,
      projectId: "project-transaction",
      workspaceRoot: root,
      proposal: proposal([
        { path: "src/one.ts", content: "export const one = 1;\n" },
        { path: "src/two.ts", content: "export const two = 2;\n" },
      ]),
    });

    assert(result.writes.length === 2, "Successful batch must report every governed write.");
    assert((await readFile(join(root, "src", "one.ts"), "utf8")) === "export const one = 1;\n", "First successful batch file must persist.");
    assert((await readFile(join(root, "src", "two.ts"), "utf8")) === "export const two = 2;\n", "Second successful batch file must persist.");
    console.log("06.TRANSACTION successful multi-file batch persists together: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function failedBatchRemovesNewFiles(): Promise<void> {
  const root = await workspace("kings-write-transaction-create-rollback-");
  try {
    const bridge = createBridge(root, 64);
    let failed = false;
    try {
      await bridge.execute({
        step,
        projectId: "project-transaction",
        workspaceRoot: root,
        proposal: proposal([
          { path: "src/created-before-failure.ts", content: "export const temporary = true;\n" },
          { path: "src/too-large.ts", content: "x".repeat(256) },
        ]),
      });
    } catch (error) {
      failed = /rolled back/i.test(error instanceof Error ? error.message : String(error));
    }

    assert(failed, "Oversized later write must fail the governed batch and report rollback.");
    assert(!(await exists(join(root, "src", "created-before-failure.ts"))), "A newly-created earlier file must be deleted during rollback.");
    assert(!(await exists(join(root, "src", "too-large.ts"))), "The rejected oversized file must never exist.");
    console.log("06.TRANSACTION failed batch removes earlier newly-created files: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function failedBatchRestoresReplacedFiles(): Promise<void> {
  const root = await workspace("kings-write-transaction-replace-rollback-");
  try {
    const originalPath = join(root, "src", "existing.ts");
    const original = "export const stable = 'original';\n";
    await writeFile(originalPath, original, "utf8");
    const bridge = createBridge(root, 64);

    let failed = false;
    try {
      await bridge.execute({
        step,
        projectId: "project-transaction",
        workspaceRoot: root,
        proposal: proposal([
          { path: "src/existing.ts", content: "export const stable = 'changed';\n" },
          { path: "src/too-large-again.ts", content: "y".repeat(256) },
        ]),
      });
    } catch (error) {
      failed = /rolled back/i.test(error instanceof Error ? error.message : String(error));
    }

    assert(failed, "A later failed write must trigger replacement rollback.");
    assert((await readFile(originalPath, "utf8")) === original, "Earlier replacement must be restored byte-for-byte after batch failure.");
    assert(!(await exists(join(root, "src", "too-large-again.ts"))), "Failed later target must not be left behind.");
    console.log("06.TRANSACTION failed batch restores earlier replacement content: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function createBridge(root: string, maxFileBytes: number): LocalCodingWriteBridge {
  return new LocalCodingWriteBridge(
    new EngineeringRepairEditor(
      new ControlledFileEditor({
        allowedReadPaths: [root],
        allowedWritePaths: [root],
        maxFileBytes,
      }),
    ),
  );
}

function proposal(changes: { path: string; content: string }[]): EngineeringWorkspaceProposalResult {
  return {
    command: {
      id: "command-repair-step-transaction",
      executionStepId: step.id,
      projectId: "project-transaction",
      language: "typescript",
      operation: "create",
      workingDirectory: "/governed/workspace",
      allowed: true,
    },
    taskId: step.id,
    missionId: "project-transaction",
    changes: changes.map((change) => ({
      path: change.path,
      operation: "create",
      content: change.content,
      language: "typescript",
    })),
  };
}

async function workspace(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, "src"), { recursive: true });
  return root;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
