import {
  runCodeTest,
  type CodeTestResult,
} from "./code-test-runner";

import {
  applyMultiFileTransaction,
  cleanupMultiFileTransaction,
  stageMultiFileTransaction,
  type MultiFileTransactionResult,
} from "./multi-file-transaction";

import type {
  MultiFileChange,
} from "./multi-file-proposal";

export interface VerifiedMultiFileTransactionRequest {
  workspacePath: string;
  changes: readonly MultiFileChange[];
  testCommand: string;
  testArgs: readonly string[];
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface VerifiedMultiFileTransactionResult {
  success: boolean;
  staged: MultiFileTransactionResult;
  testResult?: CodeTestResult;
  appliedPaths: string[];
  reasons: string[];
}

export async function executeVerifiedMultiFileTransaction(
  request:
    VerifiedMultiFileTransactionRequest,
): Promise<VerifiedMultiFileTransactionResult> {
  const staged =
    await stageMultiFileTransaction({
      workspacePath:
        request.workspacePath,

      changes:
        request.changes,
    });

  if (
    !staged.success
  ) {
    return {
      success:
        false,

      staged,

      appliedPaths:
        [],

      reasons:
        staged.reasons,
    };
  }

  const testResult =
    await runCodeTest({
      workspacePath:
        staged.stagedWorkspacePath,

      command:
        request.testCommand,

      args:
        request.testArgs,

      timeoutMs:
        request.timeoutMs,

      maxOutputBytes:
        request.maxOutputBytes,
    });

  if (
    !testResult.success
  ) {
    await cleanupMultiFileTransaction(
      staged.stagedWorkspacePath,
    );

    return {
      success:
        false,

      staged,

      testResult,

      appliedPaths:
        [],

      reasons: [
        "K.I.N.G.S. multi-file transaction verification failed.",
        testResult.stderr,
        testResult.stdout,
      ].filter(
        (
          value,
        ) =>
          value.length >
          0,
      ),
    };
  }

  const applied =
    await applyMultiFileTransaction(
      request,
      staged.stagedWorkspacePath,
    );

  await cleanupMultiFileTransaction(
    staged.stagedWorkspacePath,
  );

  if (
    !applied.success
  ) {
    return {
      success:
        false,

      staged,

      testResult,

      appliedPaths:
        applied.appliedPaths,

      reasons:
        applied.reasons,
    };
  }

  return {
    success:
      true,

    staged,

    testResult,

    appliedPaths:
      applied.appliedPaths,

    reasons:
      [],
  };
}
