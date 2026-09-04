import { execFile } from "node:child_process";
import { mkdir, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ParallelGitWorktree {
  taskId: string;
  path: string;
  baseRef: string;
  branch: string;
}

export interface ParallelGitWorktreeOptions {
  gitExecutable?: string;
  worktreeRoot?: string;
  commandTimeoutMs?: number;
}

function safeSegment(value: string): string {
  const raw = value.trim();
  if (
    !raw ||
    raw.includes("/") ||
    raw.includes("\\") ||
    raw === "." ||
    raw === ".." ||
    raw.startsWith(".")
  ) {
    throw new Error(
      "K.I.N.G.S. Parallel Worktrees: task id contains path or traversal syntax.",
    );
  }

  const normalized = raw
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96);

  if (!normalized || normalized.startsWith("-")) {
    throw new Error(
      "K.I.N.G.S. Parallel Worktrees: task id cannot produce a safe worktree segment.",
    );
  }
  return normalized;
}

function pathInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export class ParallelGitWorktreeAuthority {
  private readonly gitExecutable: string;
  private readonly worktreeRoot: string;
  private readonly commandTimeoutMs: number;

  constructor(
    private readonly repositoryRoot: string,
    options: ParallelGitWorktreeOptions = {},
  ) {
    if (!repositoryRoot.trim()) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: repository root is required.");
    }
    this.gitExecutable = options.gitExecutable ?? "git";
    this.worktreeRoot = resolve(
      options.worktreeRoot ?? join(dirname(resolve(repositoryRoot)), ".kings-worktrees"),
    );
    this.commandTimeoutMs = options.commandTimeoutMs ?? 60_000;
    if (!Number.isInteger(this.commandTimeoutMs) || this.commandTimeoutMs < 1) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: command timeout must be a positive integer.");
    }
  }

  async verifyRepository(): Promise<void> {
    const { stdout } = await this.git([
      "-C",
      this.repositoryRoot,
      "rev-parse",
      "--show-toplevel",
    ]);
    const actual = await realpath(stdout.trim());
    const expected = await realpath(this.repositoryRoot);
    if (actual !== expected) {
      throw new Error(
        `K.I.N.G.S. Parallel Worktrees: repository root mismatch (${actual} !== ${expected}).`,
      );
    }
  }

  async prepare(taskId: string, baseRef = "HEAD"): Promise<ParallelGitWorktree> {
    const segment = safeSegment(taskId);
    if (!baseRef.trim() || baseRef.startsWith("-")) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: base ref is invalid.");
    }
    await this.verifyRepository();
    await mkdir(this.worktreeRoot, { recursive: true });
    const target = resolve(this.worktreeRoot, segment);
    if (!pathInside(this.worktreeRoot, target) || target === this.worktreeRoot) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: target escapes the worktree root.");
    }

    const branch = `kings-parallel/${segment}`;
    await this.git([
      "-C",
      this.repositoryRoot,
      "worktree",
      "add",
      "--detach",
      target,
      baseRef,
    ]);

    try {
      await this.git(["-C", target, "switch", "-c", branch]);
    } catch (error) {
      await this.git([
        "-C",
        this.repositoryRoot,
        "worktree",
        "remove",
        "--force",
        target,
      ]).catch(() => undefined);
      throw error;
    }

    return {
      taskId,
      path: target,
      baseRef,
      branch,
    };
  }

  async remove(worktree: ParallelGitWorktree): Promise<void> {
    const target = resolve(worktree.path);
    if (!pathInside(this.worktreeRoot, target) || target === this.worktreeRoot) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: refusing to remove a path outside the governed worktree root.");
    }
    await this.git([
      "-C",
      this.repositoryRoot,
      "worktree",
      "remove",
      "--force",
      target,
    ]).catch(async (error) => {
      await rm(target, { recursive: true, force: true });
      await this.git(["-C", this.repositoryRoot, "worktree", "prune"])
        .catch(() => undefined);
      throw error;
    });
  }

  async prune(): Promise<void> {
    await this.verifyRepository();
    await this.git(["-C", this.repositoryRoot, "worktree", "prune"]);
  }

  private async git(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync(this.gitExecutable, args, {
        encoding: "utf8",
        timeout: this.commandTimeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
    } catch (error) {
      const failure = error as Error & { stderr?: string; stdout?: string };
      throw new Error(
        `K.I.N.G.S. Parallel Worktrees: git command failed: ${failure.message}${failure.stderr ? `\n${failure.stderr}` : ""}`,
      );
    }
  }
}
