import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import {
  GitHubRepositoryWorkspaceAuthority,
  GitHubRepositoryWorkspaceError,
  type GitCommandResult,
  type GitCommandRunner,
} from "./github-repository-workspace";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

class FakeGitRunner implements GitCommandRunner {
  readonly calls: string[][] = [];
  private dirty = false;
  private head = "1111111111111111111111111111111111111111";

  constructor(private readonly workspace: string) {}

  markDirty(): void {
    this.dirty = true;
  }

  async run(
    args: readonly string[],
    workingDirectory: string,
  ): Promise<GitCommandResult> {
    this.calls.push([...args]);
    const command = args[0];

    if (command === "clone") {
      await mkdir(join(this.workspace, ".git"), { recursive: true });
      await writeFile(join(this.workspace, "package.json"), "{\"scripts\":{\"test\":\"node --test\"}}\n");
      return this.ok();
    }
    if (command === "remote") {
      return this.ok("https://github.com/example/project.git\n");
    }
    if (command === "status") {
      return this.ok(this.dirty ? " M src/index.ts\n" : "");
    }
    if (command === "branch") return this.ok("");
    if (command === "switch") return this.ok();
    if (command === "fetch") return this.ok();
    if (command === "add") return this.ok();
    if (command === "commit" || (command === "-c" && args.includes("commit"))) {
      this.head = "2222222222222222222222222222222222222222";
      this.dirty = false;
      return this.ok("[kings/mission-1 abc123] verified\n");
    }
    if (command === "rev-parse") return this.ok(`${this.head}\n`);
    if (command === "push") return this.ok("branch published\n");

    return this.ok();
  }

  private ok(stdout = ""): GitCommandResult {
    return { exitCode: 0, stdout, stderr: "" };
  }
}

async function runTest(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-github-workspace-"));
  const workspace = join(root, "mission-1");
  const runner = new FakeGitRunner(workspace);
  const authority = new GitHubRepositoryWorkspaceAuthority(runner);

  try {
    const prepared = await authority.prepare({
      missionId: "mission-1",
      workspaceRoot: workspace,
      repository: {
        url: "https://github.com/example/project",
        baseRef: "main",
      },
    });

    assert(prepared.metadata.repositoryId === "example/project", "GitHub repository identity was not normalized.");
    assert(prepared.metadata.publishBranch === "kings/mission-1", "A safe K.I.N.G.S. work branch was not created.");
    assert(
      runner.calls.some((args) => args[0] === "clone"),
      "Repository was not acquired through git clone.",
    );
    assert(
      runner.calls.some((args) => args[0] === "switch" && args.includes("-c")),
      "K.I.N.G.S. work branch was not created.",
    );
    console.log("GITHUB-WORKSPACE-001 governed GitHub checkout + work branch: SUCCESS");

    let blockedUnverified = false;
    runner.markDirty();
    try {
      await authority.publishVerified(workspace, {
        missionId: "mission-1",
        verified: false,
      });
    } catch (error) {
      blockedUnverified =
        error instanceof GitHubRepositoryWorkspaceError &&
        error.message.includes("verification passes");
    }
    assert(blockedUnverified, "Unverified changes were allowed to publish.");
    console.log("GITHUB-WORKSPACE-002 remote write blocked before verification: SUCCESS");

    const published = await authority.publishVerified(workspace, {
      missionId: "mission-1",
      verified: true,
    });
    assert(published.published, "Verified changes were not published.");
    assert(published.branch === "kings/mission-1", "Verified changes targeted the wrong branch.");
    assert(
      runner.calls.some(
        (args) =>
          args[0] === "push" &&
          args.includes("HEAD:refs/heads/kings/mission-1") &&
          !args.includes("--force"),
      ),
      "Verified publication was not a non-force push to the K.I.N.G.S. branch.",
    );
    console.log("GITHUB-WORKSPACE-003 verified commit + non-force branch push: SUCCESS");

    let directMainBlocked = false;
    try {
      await authority.prepare({
        missionId: "mission-2",
        workspaceRoot: join(root, "mission-2"),
        repository: {
          url: "https://github.com/example/project",
          publishBranch: "main",
        },
      });
    } catch (error) {
      directMainBlocked =
        error instanceof GitHubRepositoryWorkspaceError &&
        error.message.includes("main/master");
    }
    assert(directMainBlocked, "Direct publication to main was not rejected.");
    console.log("GITHUB-WORKSPACE-004 protected default branch policy: SUCCESS");

    console.log("K.I.N.G.S. GITHUB REPOSITORY WORKSPACE: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
