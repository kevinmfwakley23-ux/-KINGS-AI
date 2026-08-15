import {
  readdir,
  readFile,
} from "node:fs/promises";

import {
  join,
  relative,
} from "node:path";

export interface CodeSearchMatch {
  path: string;
  line: number;
  text: string;
}

export interface CodeSearchRequest {
  workspacePath: string;
  query: string;
  maxMatches: number;
}

const IGNORED =
  new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "coverage",
    ".cache",
  ]);

async function walk(
  root: string,
  current: string,
  files: string[],
): Promise<void> {
  const entries =
    await readdir(
      current,
      {
        withFileTypes:
          true,
      },
    );

  for (
    const entry of
    entries
  ) {
    if (
      IGNORED.has(
        entry.name,
      )
    ) {
      continue;
    }

    const full =
      join(
        current,
        entry.name,
      );

    if (
      entry.isDirectory()
    ) {
      await walk(
        root,
        full,
        files,
      );
      continue;
    }

    files.push(
      relative(
        root,
        full,
      ),
    );
  }
}

function normalizeTokens(
  value: string,
): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(
          /[^a-z0-9_./-]+/g,
          " ",
        )
        .split(/\s+/)
        .map(
          (token) =>
            token.trim(),
        )
        .filter(
          (token) =>
            token.length >= 3,
        ),
    ),
  );
}

function scoreLine(
  line: string,
  tokens: string[],
): number {
  const lower =
    line.toLowerCase();

  let score = 0;

  for (
    const token of tokens
  ) {
    if (
      lower.includes(
        token,
      )
    ) {
      score += 1;
    }
  }

  return score;
}

export async function searchCode(
  request:
    CodeSearchRequest,
): Promise<CodeSearchMatch[]> {
  const files:
    string[] = [];

  await walk(
    request.workspacePath,
    request.workspacePath,
    files,
  );

  const tokens =
    normalizeTokens(
      request.query,
    );

  const ranked:
    Array<
      CodeSearchMatch & {
        score: number;
      }
    > = [];

  for (
    const relativePath of
    files
  ) {
    if (
      !/\.(ts|tsx|js|jsx|json|md|py|rs|go|java|cs|cpp|c|h|css|html|yml|yaml)$/
        .test(
          relativePath,
        )
    ) {
      continue;
    }

    let content:
      string;

    try {
      content =
        await readFile(
          join(
            request.workspacePath,
            relativePath,
          ),
          "utf8",
        );
    } catch {
      continue;
    }

    const pathScore =
      scoreLine(
        relativePath,
        tokens,
      );

    const lines =
      content.split(
        "\n",
      );

    for (
      let index = 0;
      index <
        lines.length;
      index++
    ) {
      const line =
        lines[index];

      const lineScore =
        scoreLine(
          line,
          tokens,
        );

      const score =
        pathScore +
        lineScore;

      if (
        score > 0
      ) {
        ranked.push({
          path:
            relativePath,

          line:
            index + 1,

          text:
            line.trim(),

          score,
        });
      }
    }
  }

  ranked.sort(
    (
      left,
      right,
    ) =>
      right.score -
      left.score ||
      left.path.localeCompare(
        right.path,
      ) ||
      left.line -
        right.line,
  );

  return ranked
    .slice(
      0,
      request.maxMatches,
    )
    .map(
      (
        result,
      ) => ({
        path:
          result.path,
        line:
          result.line,
        text:
          result.text,
      }),
    );
}
