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
    });
    const left = await authority.prepare("implement-feature-a");
    const right = await authority.prepare("implement-feature-b");

    assert.notEqual(left.path, right.path);
    assert.notEqual(left.branch, right.branch);
    assert(left.branch.startsWith("kings-parallel/"));
    assert(right.branch.startsWith("kings-parallel/"));

    await writeFile(join(left.path, "shared.txt"), "left-agent\n", "utf8");
    await writeFile(join(right.path, "shared.txt"), "right-agent\n", "utf8");

    assert.equal(await readFile(join(left.path, "shared.txt"), "utf8"), "left-agent\n");
    assert.equal(await readFile(join(right.path, "shared.txt"), "utf8"), "right-agent\n");
    assert.equal(await readFile(join(repository, "shared.txt"), "utf8"), "base\n");

    await authority.remove(left);
    await authority.remove(right);
    await authority.prune();

    let rejectedEscape = false;
    try {
      await authority.prepare("../../escape");
    } catch {
      rejectedEscape = true;
    }
    assert(rejectedEscape, "unsafe task ids must never become worktree escape paths or refs");

    console.log("PARALLEL-WORKTREES-001 independent Git working directories: SUCCESS");
    console.log("PARALLEL-WORKTREES-002 base checkout remains untouched: SUCCESS");
    console.log("PARALLEL-WORKTREES-003 governed cleanup + path safety: SUCCESS");
    console.log("K.I.N.G.S. PARALLEL GIT WORKTREES: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
