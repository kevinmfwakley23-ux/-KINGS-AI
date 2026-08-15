import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  basename,
  dirname,
  join,
  resolve,
} from "node:path";

import type {
  MultiFileChange,
} from "./multi-file-proposal";

export interface MultiFileTransactionRequest {
  workspacePath: string;
  changes: readonly MultiFileChange[];
}

export interface MultiFileTransactionResult {
  success: boolean;
  stagedWorkspacePath: string;
  verifiedPaths: string[];
  appliedPaths: string[];
  reasons: string[];
}

async function ensureParent(
  path: string,
): Promise<void> {
  await mkdir(
    dirname(
      path,
    ),
    {
      recursive:
        true,
    },
  );
}

async function stageChange(
  workspacePath: string,
  stagingPath: string,
  change: MultiFileChange,
): Promise<void> {
  const sourcePath =
    resolve(
      change.path,
    );

  const relativePath =
    sourcePath.startsWith(
      resolve(
        workspacePath,
      ) + "/",
    )
      ? sourcePath.slice(
          resolve(
            workspacePath,
          ).length + 1,
        )
      : basename(
          sourcePath,
        );

  const destination =
    join(
      stagingPath,
      relativePath,
    );

  await ensureParent(
    destination,
  );

  if (
    change.operation ===
    "replace"
  ) {
    const existing =
      await readFile(
        sourcePath,
        "utf8",
      );

    if (
      existing.length ===
      0
    ) {
      throw new Error(
        `Cannot replace empty source file "${sourcePath}".`,
      );
    }
  }

  await writeFile(
    destination,
    change.content,
    "utf8",
  );
}

export async function stageMultiFileTransaction(
  request:
    MultiFileTransactionRequest,
): Promise<MultiFileTransactionResult> {
  const reasons:
    string[] = [];

  const stagedWorkspacePath =
    await mkdtemp(
      "/tmp/kings-multifile-stage-",
    );

  const verifiedPaths:
    string[] = [];

  try {
    for (
      const change of
      request.changes
    ) {
      await stageChange(
        request.workspacePath,
        stagedWorkspacePath,
        change,
      );

      verifiedPaths.push(
        change.path,
      );
    }

    return {
      success:
        true,

      stagedWorkspacePath,

      verifiedPaths,

      appliedPaths:
        [],

      reasons,
    };
  } catch (
    error
  ) {
    reasons.push(
      error instanceof Error
        ? error.message
        : String(error),
    );

    return {
      success:
        false,

      stagedWorkspacePath,

      verifiedPaths,

      appliedPaths:
        [],

      reasons,
    };
  }
}

export async function applyMultiFileTransaction(
  request:
    MultiFileTransactionRequest,
  stagedWorkspacePath:
    string,
): Promise<MultiFileTransactionResult> {
  const reasons:
    string[] = [];

  const appliedPaths:
    string[] = [];

  try {
    for (
      const change of
      request.changes
    ) {
      const sourcePath =
        resolve(
          change.path,
        );

      const relativePath =
        sourcePath.startsWith(
          resolve(
            request.workspacePath,
          ) + "/",
        )
          ? sourcePath.slice(
              resolve(
                request.workspacePath,
              ).length + 1,
            )
          : basename(
              sourcePath,
            );

      const stagedPath =
        join(
          stagedWorkspacePath,
          relativePath,
        );

      await ensureParent(
        sourcePath,
      );

      await copyFile(
        stagedPath,
        sourcePath,
      );

      appliedPaths.push(
        sourcePath,
      );
    }

    return {
      success:
        true,

      stagedWorkspacePath,

      verifiedPaths:
        appliedPaths,

      appliedPaths,

      reasons,
    };
  } catch (
    error
  ) {
    reasons.push(
      error instanceof Error
        ? error.message
        : String(error),
    );

    return {
      success:
        false,

      stagedWorkspacePath,

      verifiedPaths:
        appliedPaths,

      appliedPaths,

      reasons,
    };
  }
}

export async function cleanupMultiFileTransaction(
  stagedWorkspacePath:
    string,
): Promise<void> {
  await rm(
    stagedWorkspacePath,
    {
      recursive:
        true,
      force:
        true,
    },
  );
}
