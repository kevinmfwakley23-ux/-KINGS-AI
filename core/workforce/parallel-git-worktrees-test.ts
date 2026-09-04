import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ParallelGitWorktreeAuthority } from "./parallel-git-worktrees";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
  });
  return stdout;
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-parallel-worktrees-"));
  const repository = join(root, "repo");
  const worktrees = join(root, "worktrees");
  try {
    await execFileAsync("git", ["init", repository], { encoding: "utf8" });
    await git(repository, ["config", "user.email", "kings-test@example.invalid"]);
    await git(repository, ["config", "user.name", "KINGS Test"]);
    await writeFile(join(repository, "shared.txt"), "base\n", "utf8");
    await git(repository, ["add", "shared.txt"]);
    await git(repository, ["commit", "-m", "base"]);

    const authority = new ParallelGitWorktreeAuthority(repository, {
      worktreeRoot: worktrees,
      commandTimeoutMs: 20_000,
      commitUserName: "KINGS Worktree Test",
      commitUserEmail: "kings-worktree-test@example.invalid",
    });

    // The same logical task may be retried or run under a new execution id.
    // Each execution must receive a distinct worktree and branch.
    const left = await authority.prepare(
      "implement-feature",
      "HEAD",
      "execution-left",
    );
    const retry = await authority.prepare(
      "implement-feature",
      "HEAD",
      "execution-retry",
    );

    assert.notEqual(left.path, retry.path);
    assert.notEqual(left.branch, retry.branch);
    assert.equal(left.baseSha, retry.baseSha);
    assert(left.branch.startsWith("kings-parallel/implement-feature-"));
    assert(retry.branch.startsWith("kings-parallel/implement-feature-"));

    await writeFile(join(left.path, "shared.txt"), "left-agent\n", "utf8");
    await writeFile(join(retry.path, "shared.txt"), "retry-agent\n", "utf8");

    assert.equal(await readFile(join(left.path, "shared.txt"), "utf8"), "left-agent\n");
    assert.equal(await readFile(join(retry.path, "shared.txt"), "utf8"), "retry-agent\n");
    assert.equal(await readFile(join(repository, "shared.txt"), "utf8"), "base\n");

    const dirtyLeft = await authority.inspect(left);
    assert.equal(dirtyLeft.dirty, true);
    assert.match(dirtyLeft.statusPorcelain, /shared\.txt/);

    let dirtyRemovalRejected = false;
    try {
      await authority.remove(left);
    } catch (error) {
      dirtyRemovalRejected =
        error instanceof Error &&
        error.message.includes("dirty worktree");
    }
    assert.equal(
      dirtyRemovalRejected,
      true,
      "uncommitted agent output must never be silently destroyed",
    );

    const committed = await authority.commitChanges(
      left,
      ["shared.txt"],
      "test: preserve isolated agent result",
    );
    assert.notEqual(committed.commitSha, left.baseSha);
    assert.deepEqual(committed.committedPaths, ["shared.txt"]);
    assert.equal(committed.remainingDirty, false);

    await authority.remove(left);

    // Removing a clean worktree must preserve its result branch so a later
    // verification/merge authority can inspect and integrate it.
    assert.equal(
      await gitOutput(repository, ["show", `${left.branch}:shared.txt`]),
      "left-agent\n",
    );

    let commitEscapeRejected = false;
    try {
      await authority.commitChanges(
        retry,
        ["../outside.txt"],
        "should not commit",
      );
    } catch (error) {
      commitEscapeRejected =
        error instanceof Error &&
        error.message.includes("outside the governed worktree");
    }
    assert.equal(
      commitEscapeRejected,
      true,
      "commit path traversal must fail before Git stages anything",
    );

    await authority.remove(retry, {
      discardChanges: true,
      deleteBranch: true,
    });
    assert.equal(
      (await gitOutput(repository, ["branch", "--list", retry.branch])).trim(),
      "",
      "explicit discard cleanup should remove the abandoned execution branch",
    );

    await authority.prune();

    let rejectedTaskEscape = false;
    try {
      await authority.prepare("../../escape");
    } catch {
      rejectedTaskEscape = true;
    }
    assert(rejectedTaskEscape, "unsafe task ids must never become worktree escape paths or refs");

    let rejectedExecutionEscape = false;
    try {
      await authority.prepare("safe-task", "HEAD", "../escape");
    } catch {
      rejectedExecutionEscape = true;
    }
    assert(rejectedExecutionEscape, "unsafe execution ids must never become worktree escape paths or refs");

    assert.equal(await readFile(join(repository, "shared.txt"), "utf8"), "base\n");

    console.log("PARALLEL-WORKTREES-001 retry-safe unique Git workspaces: SUCCESS");
    console.log("PARALLEL-WORKTREES-002 base checkout remains untouched: SUCCESS");
    console.log("PARALLEL-WORKTREES-003 dirty work cannot be silently destroyed: SUCCESS");
    console.log("PARALLEL-WORKTREES-004 committed agent branch survives worktree cleanup: SUCCESS");
    console.log("PARALLEL-WORKTREES-005 explicit discard removes abandoned branch: SUCCESS");
    console.log("PARALLEL-WORKTREES-006 task/execution/commit path traversal rejected: SUCCESS");
    console.log("K.I.N.G.S. PARALLEL GIT WORKTREE LIFECYCLE: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("K.I.N.G.S. PARALLEL GIT WORKTREE LIFECYCLE: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
