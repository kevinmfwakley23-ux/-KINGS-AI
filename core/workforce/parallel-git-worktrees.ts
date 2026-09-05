import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ParallelGitWorktree {
  taskId: string;
  executionId: string;
  path: string;
  baseRef: string;
  baseSha: string;
  branch: string;
}

export interface ParallelGitWorktreeState {
  worktree: ParallelGitWorktree;
  branch: string;
  headSha: string;
  dirty: boolean;
  statusPorcelain: string;
}

export interface ParallelGitWorktreeCommitResult {
  worktree: ParallelGitWorktree;
  commitSha: string;
  committedPaths: string[];
  remainingDirty: boolean;
}

export interface ParallelGitWorktreeCleanupOptions {
  /** Explicitly authorize destruction of uncommitted changes. */
  discardChanges?: boolean;
  /** Remove the branch after the worktree is removed. */
  deleteBranch?: boolean;
}

export interface ParallelGitWorktreeOptions {
  gitExecutable?: string;
  worktreeRoot?: string;
  commandTimeoutMs?: number;
  commitUserName?: string;
  commitUserEmail?: string;
}

function safeSegment(
  value: string,
  label: string,
  maxLength: number,
): string {
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
      `K.I.N.G.S. Parallel Worktrees: ${label} contains path or traversal syntax.`,
    );
  }

  const normalized = raw
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new Error(
      `K.I.N.G.S. Parallel Worktrees: ${label} cannot produce a safe worktree segment.`,
    );
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const digest = createHash("sha256")
    .update(raw)
    .digest("hex")
    .slice(0, 10);
  const prefixLength = Math.max(1, maxLength - digest.length - 1);
  const prefix = normalized
    .slice(0, prefixLength)
    .replace(/-+$/g, "") || "x";
  return `${prefix}-${digest}`;
}

function pathInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function safeRelativePath(value: string): string {
  const normalized = value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/, "");
  const segments = normalized.split("/");

  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("/") ||
    segments.includes("..") ||
    segments[0]?.toLowerCase() === ".git" ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(
      `K.I.N.G.S. Parallel Worktrees: commit path "${value}" is outside or invalid for the governed worktree.`,
    );
  }

  return normalized;
}

function literalPathspec(path: string): string {
  return `:(literal)${path}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return false;
    throw error;
  }
}

export class ParallelGitWorktreeAuthority {
  private readonly gitExecutable: string;
  private readonly worktreeRoot: string;
  private readonly commandTimeoutMs: number;
  private readonly commitUserName: string;
  private readonly commitUserEmail: string;

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
    this.commitUserName = options.commitUserName?.trim() || "K.I.N.G.S. AI";
    this.commitUserEmail = options.commitUserEmail?.trim() || "kings-ai@localhost";

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

  async prepare(
    taskId: string,
    baseRef = "HEAD",
    executionId: string = randomUUID(),
  ): Promise<ParallelGitWorktree> {
    const taskSegment = safeSegment(taskId, "task id", 56);
    const executionSegment = safeSegment(executionId, "execution id", 32);
    const cleanBaseRef = baseRef.trim();
    if (!cleanBaseRef || cleanBaseRef.startsWith("-")) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: base ref is invalid.");
    }

    await this.verifyRepository();
    const { stdout: baseStdout } = await this.git([
      "-C",
      this.repositoryRoot,
      "rev-parse",
      "--verify",
      `${cleanBaseRef}^{commit}`,
    ]);
    const baseSha = baseStdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(baseSha)) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: base ref did not resolve to a commit SHA.");
    }

    await mkdir(this.worktreeRoot, { recursive: true });
    const instanceSegment = `${taskSegment}-${executionSegment}`;
    const target = resolve(this.worktreeRoot, instanceSegment);
    if (!pathInside(this.worktreeRoot, target) || target === this.worktreeRoot) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: target escapes the worktree root.");
    }

    const branch = `kings-parallel/${instanceSegment}`;
    const branchRef = `refs/heads/${branch}`;
    const { stdout: existingBranchStdout } = await this.git([
      "-C",
      this.repositoryRoot,
      "for-each-ref",
      "--format=%(refname)",
      branchRef,
    ]);
    if (existingBranchStdout.trim()) {
      throw new Error(
        `K.I.N.G.S. Parallel Worktrees: execution branch "${branch}" already exists; refusing to overwrite preserved work.`,
      );
    }
    if (await pathExists(target)) {
      throw new Error(
        `K.I.N.G.S. Parallel Worktrees: execution target "${target}" already exists; refusing to reuse it.`,
      );
    }

    // Deliberately avoid destructive cleanup on a failed worktree-add. If Git
    // fails after creating partial state, preserving it is safer than deleting a
    // branch/path that may belong to a competing process using the same IDs.
    await this.git([
      "-C",
      this.repositoryRoot,
      "worktree",
      "add",
      "-b",
      branch,
      target,
      baseSha,
    ]);

    return {
      taskId,
      executionId,
      path: target,
      baseRef: cleanBaseRef,
      baseSha,
      branch,
    };
  }

  async inspect(worktree: ParallelGitWorktree): Promise<ParallelGitWorktreeState> {
    const target = await this.requireGovernedWorktree(worktree);
    const { stdout: branchStdout } = await this.git([
      "-C",
      target,
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    const branch = branchStdout.trim();
    if (branch !== worktree.branch) {
      throw new Error(
        `K.I.N.G.S. Parallel Worktrees: worktree branch mismatch (${branch} !== ${worktree.branch}).`,
      );
    }

    const { stdout: headStdout } = await this.git([
      "-C",
      target,
      "rev-parse",
      "HEAD",
    ]);
    const { stdout: statusStdout } = await this.git([
      "-C",
      target,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);

    return {
      worktree: { ...worktree },
      branch,
      headSha: headStdout.trim(),
      dirty: statusStdout.trim().length > 0,
      statusPorcelain: statusStdout,
    };
  }

  async commitChanges(
    worktree: ParallelGitWorktree,
    paths: readonly string[],
    message: string,
  ): Promise<ParallelGitWorktreeCommitResult> {
    if (!message.trim()) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: commit message is required.");
    }
    if (paths.length === 0) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: at least one commit path is required.");
    }

    const target = await this.requireGovernedWorktree(worktree);
    const safePaths = [...new Set(paths.map(safeRelativePath))];
    const pathspecs = safePaths.map(literalPathspec);

    await this.git([
      "-C",
      target,
      "add",
      "--",
      ...pathspecs,
    ]);

    const { stdout: stagedStdout } = await this.git([
      "-C",
      target,
      "diff",
      "--cached",
      "--name-only",
      "-z",
      "--",
      ...pathspecs,
    ]);
    const committedPaths = stagedStdout
      .split("\u0000")
      .map((path) => path.trim())
      .filter(Boolean);
    if (committedPaths.length === 0) {
      throw new Error("K.I.N.G.S. Parallel Worktrees: selected paths contain no staged changes.");
    }

    await this.git([
      "-C",
      target,
      "-c",
      `user.name=${this.commitUserName}`,
      "-c",
      `user.email=${this.commitUserEmail}`,
      "commit",
      "-m",
      message.trim(),
      "--only",
      "--",
      ...pathspecs,
    ]);

    const state = await this.inspect(worktree);
    return {
      worktree: { ...worktree },
      commitSha: state.headSha,
      committedPaths,
      remainingDirty: state.dirty,
    };
  }

  async remove(
    worktree: ParallelGitWorktree,
    options: ParallelGitWorktreeCleanupOptions = {},
  ): Promise<void> {
    const state = await this.inspect(worktree);
    if (state.dirty && !options.discardChanges) {
      throw new Error(
        "K.I.N.G.S. Parallel Worktrees: refusing to remove a dirty worktree without explicit discardChanges authorization.",
      );
    }

    await this.git([
      "-C",
      this.repositoryRoot,
      "worktree",
      "remove",
      ...(options.discardChanges ? ["--force"] : []),
      state.worktree.path,
    ]);

    if (options.deleteBranch) {
      await this.git([
        "-C",
        this.repositoryRoot,
        "branch",
        options.discardChanges ? "-D" : "-d",
        state.worktree.branch,
      ]);
    }
  }

  async prune(): Promise<void> {
    await this.verifyRepository();
    await this.git(["-C", this.repositoryRoot, "worktree", "prune"]);
  }

  private async requireGovernedWorktree(
    worktree: ParallelGitWorktree,
  ): Promise<string> {
    const target = resolve(worktree.path);
    if (!pathInside(this.worktreeRoot, target) || target === this.worktreeRoot) {
      throw new Error(
        "K.I.N.G.S. Parallel Worktrees: worktree path is outside the governed worktree root.",
      );
    }

    const { stdout } = await this.git([
      "-C",
      target,
      "rev-parse",
      "--show-toplevel",
    ]);
    const actual = await realpath(stdout.trim());
    const expected = await realpath(target);
    if (actual !== expected) {
      throw new Error(
        `K.I.N.G.S. Parallel Worktrees: governed worktree root mismatch (${actual} !== ${expected}).`,
      );
    }

    return expected;
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
