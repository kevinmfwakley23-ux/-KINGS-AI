import {
  execFile,
} from "node:child_process";

import {
  promisify,
} from "node:util";

import type {
  ID,
} from "./types";

import {
  LocalCodingWorker,
} from "./local-coding-worker";

const execFileAsync =
  promisify(execFile);

export interface LocalCodingVerificationRequest {
  taskId: ID;
  missionId: ID;
  instruction: string;
  workspacePath: string;
  targetPath: string;
  allowedReadPaths: readonly string[];
  allowedWritePaths: readonly string[];
  maxFileBytes: number;
  maxOutputTokens: number;
  maxRepairAttempts: number;
}

export interface LocalCodingVerificationResult {
  success: boolean;
  attempts: number;
  compilerOutput: string;
  writtenPaths: string[];
  reasons: string[];
}

export class LocalCodingVerificationLoop {
  constructor(
    private readonly worker:
      LocalCodingWorker =
        new LocalCodingWorker(),
  ) {}

  async execute(
    request:
      LocalCodingVerificationRequest,
  ):
    Promise<LocalCodingVerificationResult> {
    const writtenPaths: string[] = [];
    let compilerOutput = "";
    let instruction =
      request.instruction;

    for (
      let attempt = 1;
      attempt <=
        request.maxRepairAttempts + 1;
      attempt++
    ) {
      const workerResult =
        await this.worker.execute({
          id:
            `verification-${request.taskId}-${attempt}`,

          taskId:
            request.taskId,

          missionId:
            request.missionId,

          instruction,

          workspacePath:
            request.workspacePath,

          targetPath:
            request.targetPath,

          allowedWritePaths:
            request.allowedWritePaths,

          allowedReadPaths:
            request.allowedReadPaths,

          maxFileBytes:
            request.maxFileBytes,

          maxOutputTokens:
            request.maxOutputTokens,

          modelId:
            "qwen2.5-coder:1.5b",
        });

      if (
        !workerResult.success
      ) {
        compilerOutput =
          [
            ...workerResult.reasons,
          ].join("\n");

        return {
          success:
            false,

          attempts:
            attempt,

          compilerOutput,

          writtenPaths,

          reasons:
            workerResult.reasons,
        };
      }

      writtenPaths.push(
        ...workerResult.writtenPaths,
      );

      try {
        const result =
          await execFileAsync(
            "runtimes/source-inspection/node_modules/.bin/tsc",
            [
              "--strict",
              "--target",
              "ES2022",
              "--module",
              "commonjs",
              "--moduleResolution",
              "node",
              "--skipLibCheck",
              "--typeRoots",
              "runtimes/source-inspection/node_modules/@types",
              "--noEmit",
              request.targetPath,
            ],
            {
              cwd:
                process.cwd(),
            },
          );

        compilerOutput =
          result.stdout +
          result.stderr;

        return {
          success:
            true,

          attempts:
            attempt,

          compilerOutput,

          writtenPaths,

          reasons: [],
        };
      } catch (
        error
      ) {
        compilerOutput =
          [
            error instanceof
              Error
              ? error.message
              : String(error),

            typeof error ===
              "object" &&
            error !== null &&
            "stdout" in error
              ? String(
                  (
                    error as {
                      stdout?: unknown;
                    }
                  ).stdout ??
                    "",
                )
              : "",

            typeof error ===
              "object" &&
            error !== null &&
            "stderr" in error
              ? String(
                  (
                    error as {
                      stderr?: unknown;
                    }
                  ).stderr ??
                    "",
                )
              : "",
          ]
            .filter(
              (
                value,
              ) =>
                value.length >
                0,
            )
            .join("\n");

        if (
          attempt >
          request.maxRepairAttempts
        ) {
          return {
            success:
              false,

            attempts:
              attempt,

            compilerOutput,

            writtenPaths,

            reasons: [
              "Maximum coding repair attempts reached.",
              compilerOutput,
            ],
          };
        }

        instruction =
          [
            request.instruction,
            "",
            "A previous implementation was written but failed strict TypeScript verification.",
            "Repair the existing target file rather than starting an unrelated implementation.",
            "",
            "Compiler feedback:",
            compilerOutput,
          ].join("\n");
      }
    }

    return {
      success:
        false,

      attempts:
        request.maxRepairAttempts + 1,

      compilerOutput,

      writtenPaths,

      reasons: [
        "Coding verification loop ended without a successful verification result.",
      ],
    };
  }
}
