import type {
  ID,
} from "./types";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import {
  OllamaIntelligenceModel,
} from "./ollama-intelligence-model";

import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "./ollama-execution-client";

import type {
  LocalCodingChangeProposal,
} from "./local-coding-change-proposal";

import {
  ControlledFileEditor,
} from "./file-editor";

import {
  RepositoryContextBuilder,
} from "./repository-context";

import {
  inspectRelevantSource,
} from "./source-inspection";


function normalizeLocalCodingModelProposal(
  raw: string,
  taskId: ID,
  missionId: ID,
): LocalCodingChangeProposal {
  const cleaned =
    raw
      .trim()
      .replace(
        /^###\s*/gm,
        "",
      );

  const summaryMarker =
    "SUMMARY:";

  const operationMarker =
    "\nOPERATION:";

  const pathMarker =
    "\nPATH:";

  const contentMarker =
    "\nCONTENT:";

  const summaryStart =
    cleaned.indexOf(
      summaryMarker,
    );

  const operationStart =
    cleaned.indexOf(
      operationMarker,
      summaryStart +
        summaryMarker.length,
    );

  const pathStart =
    cleaned.indexOf(
      pathMarker,
      operationStart +
        operationMarker.length,
    );

  const contentStart =
    cleaned.indexOf(
      contentMarker,
      pathStart +
        pathMarker.length,
    );

  if (
    summaryStart !== 0 ||
    operationStart < 0 ||
    pathStart < 0 ||
    contentStart < 0
  ) {
    throw new Error(
      [
        "K.I.N.G.S. Local Coding Proposal: model output did not follow the required text protocol.",
        "MODEL OUTPUT:",
        raw,
      ].join("\n"),
    );
  }

  const summary =
    cleaned
      .slice(
        summaryMarker.length,
        operationStart,
      )
      .trim();

  const operationText =
    cleaned
      .slice(
        operationStart +
          operationMarker.length,
        pathStart,
      )
      .trim()
      .toLowerCase();

  const operationMatch =
    operationText.match(
      /\b(create|replace)\b/i,
    );

  const operation =
    operationMatch?.[1]?.toLowerCase();

  if (
    operation !== "create" &&
    operation !== "replace"
  ) {
    throw new Error(
      `K.I.N.G.S. Local Coding Proposal: invalid operation "${operationText}". Expected create or replace.`,
    );
  }

  const rawModelPath =
    cleaned
      .slice(
        pathStart +
          pathMarker.length,
        contentStart,
      )
      .trim();

  const modelPath =
    rawModelPath
      .replace(
        /^`+|`+$/g,
        "",
      )
      .replace(
        /^["']+|["']+$/g,
        "",
      )
      .trim();

  let content =
    cleaned
      .slice(
        contentStart +
          contentMarker.length,
      )
      .trim();

  content =
    content
      .replace(
        /^```(?:typescript|ts|javascript|js)?\s*/i,
        "",
      )
      .replace(
        /\s*```\s*$/i,
        "",
      )
      .trim();

  const noteIndex =
    content.search(
      /\n(?:Note|Explanation|This TypeScript file|This file)\s*:/i,
    );

  if (
    noteIndex >= 0
  ) {
    content =
      content
        .slice(
          0,
          noteIndex,
        )
        .trimEnd();
  }

  if (
    summary.length === 0 ||
    modelPath.length === 0 ||
    content.length === 0
  ) {
    throw new Error(
      "K.I.N.G.S. Local Coding Proposal: model output contained an empty summary, path, or content.",
    );
  }

  return {
    id:
      `proposal-${taskId}`,
    taskId,
    missionId,
    summary,
    changes: [
      {
        path:
          modelPath,
        operation,
        content,
      },
    ],
  };
}


function normalizeMultiFileCodingProposal(
  raw: string,
  taskId: ID,
  missionId: ID,
): LocalCodingChangeProposal {
  const cleaned =
    raw
      .trim()
      .replace(
        /^###\s*/gm,
        "",
      );

  const summaryMarker =
    "SUMMARY:";

  if (
    !cleaned.startsWith(
      summaryMarker,
    )
  ) {
    throw new Error(
      [
        "K.I.N.G.S. Multi-File Proposal: missing SUMMARY marker.",
        "MODEL OUTPUT:",
        raw,
      ].join("\n"),
    );
  }

  const firstFileMarker =
    "\nFILE:";

  const firstFileIndex =
    cleaned.indexOf(
      firstFileMarker,
    );

  if (
    firstFileIndex < 0
  ) {
    throw new Error(
      [
        "K.I.N.G.S. Multi-File Proposal: no FILE sections were returned.",
        "MODEL OUTPUT:",
        raw,
      ].join("\n"),
    );
  }

  const summary =
    cleaned
      .slice(
        summaryMarker.length,
        firstFileIndex,
      )
      .trim();

  const sections =
    cleaned
      .slice(
        firstFileIndex,
      )
      .split(
        /\nFILE:\s*/g,
      )
      .filter(
        (
          section,
        ) =>
          section.trim()
            .length > 0,
      );

  const changes:
    LocalCodingChangeProposal["changes"] = [];

  for (
    const section of
    sections
  ) {
    const operationMarker =
      "OPERATION:";

    const pathMarker =
      "\nPATH:";

    const contentMarker =
      "\nCONTENT:";

    const operationStart =
      section.indexOf(
        operationMarker,
      );

    const pathStart =
      section.indexOf(
        pathMarker,
        operationStart +
          operationMarker.length,
      );

    const contentStart =
      section.indexOf(
        contentMarker,
        pathStart +
          pathMarker.length,
      );

    if (
      operationStart < 0 ||
      pathStart < 0 ||
      contentStart < 0
    ) {
      throw new Error(
        [
          "K.I.N.G.S. Multi-File Proposal: malformed FILE section.",
          section,
        ].join("\n"),
      );
    }

    const operationText =
      section
        .slice(
          operationStart +
            operationMarker.length,
          pathStart,
        )
        .trim()
        .toLowerCase();

    const operation =
      operationText.match(
        /\b(create|replace)\b/i,
      )?.[1]?.toLowerCase();

    if (
      operation !==
        "create" &&
      operation !==
        "replace"
    ) {
      throw new Error(
        `K.I.N.G.S. Multi-File Proposal: invalid operation "${operationText}".`,
      );
    }

    const filePath =
      section
        .slice(
          pathStart +
            pathMarker.length,
          contentStart,
        )
        .trim();

    let content =
      section
        .slice(
          contentStart +
            contentMarker.length,
        )
        .trim();

    content =
      content
        .replace(
          /^```(?:typescript|ts|javascript|js)?\s*/i,
          "",
        )
        .replace(
          /\s*```\s*$/i,
          "",
        )
        .trim();

    const noteIndex =
      content.search(
        /\n(?:Note|Explanation|This TypeScript file|This file)\s*:/i,
      );

    if (
      noteIndex >= 0
    ) {
      content =
        content
          .slice(
            0,
            noteIndex,
          )
          .trimEnd();
    }

    if (
      filePath.length === 0 ||
      content.length === 0
    ) {
      throw new Error(
        "K.I.N.G.S. Multi-File Proposal: file path and content are required.",
      );
    }

    changes.push({
      path:
        filePath,
      operation:
        operation as
          "create" |
          "replace",
      content,
    });
  }

  if (
    changes.length <
    2
  ) {
    throw new Error(
      "K.I.N.G.S. Multi-File Proposal: at least two file changes are required.",
    );
  }

  return {
    id:
      `proposal-${taskId}`,
    taskId,
    missionId,
    summary,
    changes,
  };
}

export interface LocalCodingWorkerRequest {
  id: ID;
  taskId: ID;
  missionId: ID;
  instruction: string;
  workspacePath: string;
  allowedWritePaths: readonly string[];
  allowedReadPaths: readonly string[];
  maxFileBytes: number;
  maxOutputTokens: number;
  modelId?: string;
}

export interface LocalCodingWorkerResult {
  success: boolean;
  modelResult: ModelExecutionResult;
  proposal?: LocalCodingChangeProposal;
  writtenPaths: string[];
  reasons: string[];
}

function buildPrompt(
  input:
    LocalCodingWorkerRequest,
  workspaceFiles:
    string[],
): string {
  return [
    "You are the K.I.N.G.S. local software engineering worker.",
    "Produce one complete source file for the requested task.",
    "",
    "Mission:",
    input.instruction,
    "",
    `Workspace: ${input.workspacePath}`,
    "",
    "Authorized paths:",
    ...workspaceFiles.map(
      (path) => `- ${path}`,
    ),
    "",
    "Return EXACTLY this three-part text format:",
    "SUMMARY:",
    "one short sentence",
    "",
    "OPERATION:",
    "create or replace",
    "",
    "PATH:",
    "one authorized file path",
    "",
    "CONTENT:",
    "the complete file contents starting on the next line",
    "",
    "Rules:",
    "1. Do not use JSON.",
    "2. Do not use markdown fences.",
    "3. Do not add commentary before SUMMARY or after the file content.",
    "4. PATH must be one of the authorized paths.",
    "5. CONTENT must be the complete source file.",
    "6. Write real compilable code, not pseudocode.",
    "7. Do not use placeholder text.",
  ].join("\n");
}

function extractFileList(
  request:
    LocalCodingWorkerRequest,
): string[] {
  return [
    ...new Set([
      ...request.allowedReadPaths,
      ...request.allowedWritePaths,
    ]),
  ];
}

function createDefaultTransport(): OllamaHttpTransport {
  return {
    async post(
      path,
      body,
    ) {
      const response =
        await fetch(
          `http://127.0.0.1:11434${path}`,
          {
            method:
              "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body:
              JSON.stringify(
                body,
              ),
          },
        );

      if (
        !response.ok
      ) {
        const text =
          await response.text();

        throw new Error(
          `Ollama HTTP ${response.status}: ${text}`,
        );
      }

      return response.json();
    },
  };
}

function formatRepositoryContext(
  entries: Array<{
    path: string;
    kind: "file" | "directory";
    bytes: number;
  }>,
): string {
  return entries
    .map(
      (
        entry,
      ) =>
        `${entry.kind === "directory" ? "[DIR]" : "[FILE]"} ${entry.path}${
          entry.kind === "file"
            ? ` (${entry.bytes} bytes)`
            : ""
        }`,
    )
    .join("\n");
}

export class LocalCodingWorker {
  constructor(
    private readonly model =
      new OllamaIntelligenceModel(
        new HttpOllamaExecutionClient(
          createDefaultTransport(),
        ),
        "qwen2.5-coder:1.5b",
        [
          "reasoning",
          "planning",
          "coding",
          "debugging",
          "research",
          "source-inspection",
          "tool-use",
          "verification",
          "recovery",
        ],
      ),
  ) {}

  async execute(
    request:
      LocalCodingWorkerRequest,
  ):
    Promise<LocalCodingWorkerResult> {
    const reasons: string[] = [];

    const editor =
      new ControlledFileEditor({
        allowedReadPaths:
          [
            ...request.allowedReadPaths,
          ],
        allowedWritePaths:
          [
            ...request.allowedWritePaths,
          ],
        maxFileBytes:
          request.maxFileBytes,
      });

    const workspaceFiles =
      extractFileList(
        request,
      );

    const targetPaths =
      request.allowedWritePaths.length > 0
        ? request.allowedWritePaths
        : request.allowedReadPaths;

    const existingTargets: string[] = [];

    for (
      const targetPath of
      targetPaths
    ) {
      if (
        await editor.exists({
          path:
            targetPath,
        })
      ) {
        existingTargets.push(
          targetPath,
        );
      }
    }

    const filesystemOperation =
      existingTargets.length > 0
        ? "replace"
        : "create";

    let prompt =
      buildPrompt(
        request,
        workspaceFiles,
      );

    if (
      existingTargets.length > 0
    ) {
      const relevantSource =
        await inspectRelevantSource({
          workspacePath:
            request.workspacePath,

          candidatePaths:
            existingTargets,

          maxFileBytes:
            Math.min(
              request.maxFileBytes,
              24 * 1024,
            ),

          maxFiles:
            Math.min(
              existingTargets.length,
              2,
            ),
        });

      const sourceContext =
        relevantSource.files
          .map(
            (
              file,
            ) =>
              [
                `===== TARGET FILE: ${file.path} =====`,
                file.content,
              ].join("\n"),
          )
          .join("\n\n");

      prompt =
        prompt +
        "\n\nTARGET FILE CONTEXT:\n" +
        sourceContext;
    }

    prompt =
      prompt +
      "\n\nAUTHORITATIVE FILE OPERATION:\n" +
      `OPERATION: ${filesystemOperation}\n` +
      "The operation above is authoritative. Do not change it.\n";

    const modelRequest:
      ModelExecutionRequest = {
      id:
        request.id,

      taskId:
        request.taskId,

      missionId:
        request.missionId,

      messages: [
        {
          role:
            "user",

          content:
            prompt,
        },
      ],

      requiredCapabilities: [
        "coding",
        "reasoning",
      ],

      inputModalities: [
        "text",
      ],

      outputModality:
        "text",

      maxOutputTokens:
        request.maxOutputTokens,

      allowToolProposals:
        false,
    };

    if (
      !this.model.canHandle(
        modelRequest,
      )
    ) {
      return {
        success:
          false,

        modelResult: {
          success:
            false,

          failure: {
            requestId:
              request.id,

            providerId:
              this.model.identity.providerId,

            modelId:
              this.model.identity.modelId,

            retryable:
              false,

            code:
              "KINGS_MODEL_CAPABILITY_REJECTED",

            message:
              "The selected local coding model cannot satisfy the requested capability contract.",

            metadata: {
              requestId:
                request.id,
              startedAt:
                new Date().toISOString(),
              completedAt:
                new Date().toISOString(),
              latencyMs:
                0,
            },
          },
        },

        writtenPaths: [],

        reasons: [
          "Local coding model capability contract rejected the request.",
        ],
      };
    }

    const modelResult =
      await this.model.execute(
        modelRequest,
      );

    if (
      !modelResult.success
    ) {
      reasons.push(
        modelResult.failure?.message ??
          "Local model execution failed.",
      );

      return {
        success:
          false,

        modelResult,

        writtenPaths: [],

        reasons,
      };
    }

    let proposal:
      LocalCodingChangeProposal;

    try {
      const rawModelOutput =
        modelResult.response?.content ??
        "";

      const fileSections =
        rawModelOutput.match(
          /(?:^|\n)\s*(?:###\s*)?FILE:\s*/g,
        ) ??
        [];

      if (
        fileSections.length >= 2
      ) {
        proposal =
          normalizeMultiFileCodingProposal(
            rawModelOutput,
            request.taskId,
            request.missionId,
          );
      } else {
        proposal =
          normalizeLocalCodingModelProposal(
            rawModelOutput,
            request.taskId,
            request.missionId,
          );
      }

      const allowedPaths =
        new Set(
          request.allowedWritePaths,
        );

      if (
        proposal.taskId !==
        request.taskId
      ) {
        throw new Error(
          "K.I.N.G.S. Local Coding Proposal: task identity mismatch.",
        );
      }

      if (
        proposal.missionId !==
        request.missionId
      ) {
        throw new Error(
          "K.I.N.G.S. Local Coding Proposal: mission identity mismatch.",
        );
      }

      for (
        const change of
        proposal.changes
      ) {
        if (
          !allowedPaths.has(
            change.path,
          )
        ) {
          throw new Error(
            `K.I.N.G.S. Local Coding Proposal: path "${change.path}" is outside the Work Unit authorization.`,
          );
        }

        if (
          change.path.trim() ===
          ""
        ) {
          throw new Error(
            "K.I.N.G.S. Local Coding Proposal: file path is required.",
          );
        }

        if (
          change.content.trim() ===
          ""
        ) {
          throw new Error(
            `K.I.N.G.S. Local Coding Proposal: proposed content for "${change.path}" is empty.`,
          );
        }

        if (
          change.operation !==
            "create" &&
          change.operation !==
            "replace"
        ) {
          throw new Error(
            `K.I.N.G.S. Local Coding Proposal: invalid operation "${change.operation}".`,
          );
        }
      }
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

        modelResult,

        writtenPaths: [],

        reasons,
      };
    }

    const writtenPaths:
      string[] = [];

    try {
      if (
        proposal.changes.length ===
        1 &&
        request.allowedWritePaths.length ===
        1
      ) {
        const target =
          request.allowedWritePaths[0];

        const targetExists =
          await editor.exists({
            path:
              target,
          });

        proposal = {
          ...proposal,
          changes: [
            {
              ...proposal.changes[0],
              path:
                target,
              operation:
                targetExists
                  ? "replace"
                  : "create",
            },
          ],
        };
      }

      for (
        const change of
        proposal.changes
      ) {
        const existing =
          await editor.exists({
            path:
              change.path,
          });

        const filesystemOperation =
          existing
            ? "replace"
            : "create";

        if (
          change.operation !==
          filesystemOperation
        ) {
          throw new Error(
            [
              "K.I.N.G.S. Local Coding Worker: proposal operation does not match filesystem state.",
              `Proposed operation: ${change.operation}`,
              `Filesystem operation: ${filesystemOperation}`,
              `Path: ${change.path}`,
            ].join("\n"),
          );
        }

        editor.authorizeWrite({
          path:
            change.path,
          content:
            change.content,
        });

        await editor.write({
          path:
            change.path,
          content:
            change.content,
        });

        writtenPaths.push(
          change.path,
        );
      }
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

        modelResult,

        proposal,

        writtenPaths,

        reasons,
      };
    }

    return {
      success:
        true,

      modelResult,

      proposal,

      writtenPaths,

      reasons: [],
    };
  }
}
