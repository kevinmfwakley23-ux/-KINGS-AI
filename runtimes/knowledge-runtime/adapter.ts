import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

import {
  resolve,
} from "node:path";

import {
  createInterface,
} from "node:readline";

import type {
  KnowledgeRuntimeAdapter,
} from "../../core/workforce/knowledge-runtime-adapter";

import type {
  Evidence,
  KnowledgeRecord,
  MemoryQuery,
  MemoryResult,
  MemoryType,
} from "../../core/workforce/types";

interface PythonRetrievalResult {
  score: number;
  sourceId: string;
  title: string;
  type: string;
  authority: string;
  sha256: string;
  path: string;
  page: number;
  text: string;
}

interface PythonResponse {
  query?: string;
  results?: PythonRetrievalResult[];
  error?: string;
}

export class PythonKnowledgeRuntimeAdapter
  implements KnowledgeRuntimeAdapter
{
  constructor(
    private readonly pythonExecutable: string,
    private readonly bridgePath: string,
  ) {}

  async retrieve(
    query: MemoryQuery,
  ): Promise<MemoryResult> {
    if (!query.query.trim()) {
      throw new Error(
        "K.I.N.G.S. Knowledge Runtime: query is required",
      );
    }

    const limit = query.limit ?? 10;

    if (limit < 1) {
      throw new Error(
        "K.I.N.G.S. Knowledge Runtime: limit must be positive",
      );
    }

    const unsupportedMemoryTypes =
      query.memoryTypes?.filter(
        (memoryType) =>
          memoryType !== "semantic" &&
          memoryType !== "procedural",
      ) ?? [];

    if (unsupportedMemoryTypes.length > 0) {
      throw new Error(
        "K.I.N.G.S. Knowledge Runtime: authoritative " +
        "project-document retrieval does not support " +
        `memory types: ${unsupportedMemoryTypes.join(", ")}`,
      );
    }

    const response =
      await this.runPythonBridge({
        query: query.query,
        sourceIds: query.sourceIds,
        limit,
      });

    if (response.error) {
      throw new Error(
        `K.I.N.G.S. Knowledge Runtime: ${response.error}`,
      );
    }

    const results =
      response.results ?? [];

    const authoritativeResults =
      query.authoritativeOnly
        ? results.filter(
            (result) =>
              result.authority ===
                "product-blueprint" ||
              result.authority ===
                "construction-document" ||
              result.authority ===
                "ai-build-directive",
          )
        : results;

    const filteredResults =
      query.memoryTypes
        ? authoritativeResults.filter(
            (result) =>
              query.memoryTypes!.includes(
                this.memoryTypeForSource(
                  result.type,
                ),
              ),
          )
        : authoritativeResults;

    const records: KnowledgeRecord[] = [];
    const evidence: Evidence[] = [];
    const sourceIds = [
      ...new Set(
        filteredResults.map(
          (result) => result.sourceId,
        ),
      ),
    ];

    const createdAt =
      new Date().toISOString();

    for (const result of filteredResults) {
      const evidenceId =
        this.makeId(
          "evidence",
          result.sourceId,
          result.page,
        );

      const recordId =
        this.makeId(
          "record",
          result.sourceId,
          result.page,
        );

      evidence.push({
        id: evidenceId,
        sourceId: result.sourceId,
        description:
          `Page ${result.page} of ` +
          `${result.title} supports the ` +
          `retrieved project knowledge.`,
        location:
          `${result.path}#page=${result.page}`,
        excerpt: result.text,
        createdAt,
      });

      records.push({
        id: recordId,
        sourceId: result.sourceId,
        memoryType:
          this.memoryTypeForSource(
            result.type,
          ),
        summary:
          this.createSummary(
            result.text,
          ),
        content: result.text,
        evidenceIds: [evidenceId],
        authoritative:
          result.authority ===
          "product-blueprint" ||
          result.authority ===
          "construction-document" ||
          result.authority ===
          "ai-build-directive",
        createdAt,
        updatedAt: createdAt,
      });
    }

    return {
      query: query.query,
      records,
      evidence,
      sourceIds,
      createdAt,
    };
  }

  private runPythonBridge(
    request: {
      query: string;
      sourceIds?: string[];
      limit: number;
    },
  ): Promise<PythonResponse> {
    return new Promise(
      (resolvePromise, reject) => {
        const child =
          spawn(
            this.pythonExecutable,
            [this.bridgePath],
            {
              stdio: [
                "pipe",
                "pipe",
                "pipe",
              ],
            },
          );

        this.sendRequest(
          child,
          request,
          resolvePromise,
          reject,
        );
      },
    );
  }

  private sendRequest(
    child: ChildProcessWithoutNullStreams,
    request: {
      query: string;
      sourceIds?: string[];
      limit: number;
    },
    resolvePromise: (
      value: PythonResponse,
    ) => void,
    reject: (
      reason?: unknown,
    ) => void,
  ): void {
    let settled = false;
    let stderr = "";

    child.stderr.on(
      "data",
      (chunk) => {
        stderr += chunk.toString();
      },
    );

    const reader =
      createInterface({
        input: child.stdout,
      });

    reader.once(
      "line",
      (line) => {
        if (settled) {
          return;
        }

        settled = true;
        reader.close();

        try {
          const response =
            JSON.parse(
              line,
            ) as PythonResponse;

          if (response.error) {
            reject(
              new Error(
                response.error,
              ),
            );
          } else {
            resolvePromise(response);
          }
        } catch (error) {
          reject(
            new Error(
              "Invalid JSON response from " +
              `knowledge runtime: ${error}`,
            ),
          );
        }

        child.kill();
      },
    );

    child.once(
      "error",
      (error) => {
        if (settled) {
          return;
        }

        settled = true;

        reject(error);
      },
    );

    child.once(
      "close",
      (code) => {
        if (settled) {
          return;
        }

        settled = true;

        reject(
          new Error(
            "Knowledge runtime exited before " +
            `returning a response. code=${code}` +
            (stderr
              ? ` stderr=${stderr}`
              : ""),
          ),
        );
      },
    );

    child.stdin.write(
      JSON.stringify(request) +
        "\n",
    );

    child.stdin.end();
  }

  private memoryTypeForSource(
    sourceType: string,
  ): MemoryType {
    if (
      sourceType ===
      "build-directive"
    ) {
      return "procedural";
    }

    return "semantic";
  }

  private createSummary(
    text: string,
  ): string {
    const normalized =
      text
        .replace(/\s+/g, " ")
        .trim();

    if (
      normalized.length <= 240
    ) {
      return normalized;
    }

    return (
      normalized.slice(0, 237) +
      "..."
    );
  }

  private makeId(
    prefix: string,
    sourceId: string,
    page: number,
  ): string {
    return (
      `knowledge-${prefix}-` +
      `${sourceId}-page-${page}`
    );
  }
}

export function createDefaultKnowledgeRuntimeAdapter():
  PythonKnowledgeRuntimeAdapter {
  const runtimeRoot =
    resolve(
      __dirname,
      "../../..",
    );

  const pythonExecutable =
    process.env.KINGS_AI_PYTHON ??
    "python3";

  return new PythonKnowledgeRuntimeAdapter(
    pythonExecutable,
    resolve(
      runtimeRoot,
      "runtimes",
      "knowledge-runtime",
      "python-bridge.py",
    ),
  );
}
