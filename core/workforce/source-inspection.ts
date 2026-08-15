import {
  readFile,
} from "node:fs/promises";

import {
  resolve,
} from "node:path";

export interface SourceInspectionRequest {
  workspacePath: string;
  candidatePaths: readonly string[];
  maxFileBytes: number;
  maxFiles: number;
}

export interface SourceInspectionFile {
  path: string;
  content: string;
  bytes: number;
}

export interface SourceInspectionResult {
  files: SourceInspectionFile[];
  totalBytes: number;
}

function scorePath(
  path: string,
): number {
  const value =
    path.toLowerCase();

  let score = 0;

  if (
    value.includes(
      "worker",
    )
  ) {
    score += 100;
  }

  if (
    value.includes(
      "execution",
    )
  ) {
    score += 80;
  }

  if (
    value.includes(
      "coding",
    )
  ) {
    score += 80;
  }

  if (
    value.includes(
      "proposal",
    )
  )
  {
    score += 70;
  }

  if (
    value.includes(
      "file-editor",
    )
  ) {
    score += 70;
  }

  if (
    value.includes(
      "model",
    )
  ) {
    score += 60;
  }

  if (
    value.includes(
      "verification",
    )
  ) {
    score += 50;
  }

  if (
    value.endsWith(
      ".ts",
    )
  ) {
    score += 20;
  }

  return score;
}

export async function inspectRelevantSource(
  request:
    SourceInspectionRequest,
): Promise<SourceInspectionResult> {
  const ranked =
    [...request.candidatePaths]
      .map(
        (
          path,
        ) => ({
          path,
          score:
            scorePath(
              path,
            ),
        }),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.score -
          left.score ||
          left.path.localeCompare(
            right.path,
          ),
      );

  const files:
    SourceInspectionFile[] = [];

  let totalBytes = 0;

  for (
    const candidate of
    ranked
  ) {
    if (
      files.length >=
      request.maxFiles
    ) {
      break;
    }

    const path =
      resolve(
        request.workspacePath,
        candidate.path,
      );

    try {
      const content =
        await readFile(
          path,
          "utf8",
        );

      const bytes =
        Buffer.byteLength(
          content,
          "utf8",
        );

      if (
        bytes >
        request.maxFileBytes
      ) {
        continue;
      }

      files.push({
        path:
          candidate.path,
        content,
        bytes,
      });

      totalBytes +=
        bytes;
    } catch {
      continue;
    }
  }

  return {
    files,
    totalBytes,
  };
}
