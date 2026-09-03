import {
  access,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  join,
  resolve,
} from "node:path";
import {
  spawn,
} from "node:child_process";

export interface GitHubRepositorySource {
  url: string;
  baseRef?: string;
  publishBranch?: string;
  publishVerifiedChanges?: boolean;
}

export interface GitHubRepositoryWorkspaceMetadata {
  repositoryUrl: string;
  repositoryId: string;
  baseRef: string;
  publishBranch: string;
  publishVerifiedChanges: boolean;
  missionId: string;
  preparedAt: string;
}

export interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitCommandRunner {
  run(
    args: readonly string[],
    workingDirectory: string,
    options?: {
      network?: boolean;
    },
  ): Promise<GitCommandResult>;
}

export interface GitHubRepositoryPrepareRequest {
  missionId: string;
  workspaceRoot: string;
  repository: GitHubRepositorySource;
}

export interface GitHubRepositoryPrepareResult {
  workspaceRoot: string;
  metadata: GitHubRepositoryWorkspaceMetadata;
  headSha: string;
  reusedCheckout: boolean;
}

export interface GitHubRepositoryPublishResult {
  managed: boolean;
  /**
   * True when the verified repository state is complete from the remote
   * publication perspective. This includes an already-correct repository
   * with no diff to commit.
   */
  published: boolean;
  branch?: string;
  commitSha?: string;
  changedFiles: string[];
  message: string;
}

export class GitHubRepositoryWorkspaceError extends Error {
  constructor(message: string) {
    super(`K.I.N.G.S. GitHub Repository Workspace: ${message}`);
    this.name = "GitHubRepositoryWorkspaceError";
  }
}

const METADATA_FILE = "kings-workspace.json";

function safeSegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || fallback;
}

function normalizeRef(value: string): string {
  const ref = value.trim();
  if (
    !ref ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(ref) ||
    ref.includes("..") ||
    ref.includes("//") ||
    ref.endsWith("/") ||
    ref.endsWith(".lock") ||
    ref.includes("@{") ||
    /[~^:?*\[\\\s]/.test(ref)
  ) {
    throw new GitHubRepositoryWorkspaceError(
      `repository ref "${ref}" is not safe`,
    );
  }
  return ref;
}

function normalizePublishBranch(
  value: string | undefined,
  missionId: string,
): string {
  const branch = value?.trim() || `kings/${safeSegment(missionId, "mission")}`;
  const safe = normalizeRef(branch);
  if (["main", "master"].includes(safe.toLowerCase())) {
    throw new GitHubRepositoryWorkspaceError(
      "verified changes may not be published directly to main/master; use a K.I.N.G.S. work branch",
    );
  }
  return safe;
}

function normalizeGitHubRepositoryUrl(value: string): {
  url: string;
  repositoryId: string;
} {
  const raw = value.trim();
  if (!raw) {
    throw new GitHubRepositoryWorkspaceError("repository URL is required");
  }

  const ssh = raw.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (ssh) {
    return {
      url: `git@github.com:${ssh[1]}/${ssh[2]}.git`,
      repositoryId: `${ssh[1]}/${ssh[2]}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new GitHubRepositoryWorkspaceError(
      "repository URL must be a github.com HTTPS or SSH repository URL",
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new GitHubRepositoryWorkspaceError(
      "only credential-free https://github.com/... URLs are accepted; authentication stays server-side",
    );
  }

  const parts = parsed.pathname
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "")
    .split("/");
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    throw new GitHubRepositoryWorkspaceError(
      "repository URL must identify exactly one GitHub owner/repository",
    );
  }

  return {
    url: `https://github.com/${parts[0]}/${parts[1]}.git`,
    repositoryId: `${parts[0]}/${parts[1]}`,
  };
}

function redact(value: string): string {
  return value
    .replace(/https:\/\/[^\s/@]+@github\.com/gi, "https://***@github.com")
    .replace(/(authorization:\s*(?:bearer|basic)\s+)[^\s]+/gi, "$1***");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export class GitCliCommandRunner implements GitCommandRunner {
  constructor(
    private readonly options: {
      timeoutMs?: number;
      githubToken?: string;
    } = {},
  ) {}

  run(
    args: readonly string[],
    workingDirectory: string,
  ): Promise<GitCommandResult> {
    return new Promise((resolveResult, reject) => {
      const token = this.options.githubToken?.trim();
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      };

      if (token) {
        environment.GIT_CONFIG_COUNT = "1";
        environment.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
        environment.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: bearer ${token}`;
      }

      const child = spawn("git", [...args], {
        cwd: workingDirectory,
        env: environment,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const maxOutput = 512 * 1024;
      const append = (target: "stdout" | "stderr", chunk: Buffer) => {
        const current = Buffer.byteLength(stdout) + Buffer.byteLength(stderr);
        if (current >= maxOutput) return;
        const text = chunk.toString("utf8").slice(0, maxOutput - current);
        if (target === "stdout") stdout += text;
        else stderr += text;
      };
      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, this.options.timeoutMs ?? 300_000);

      child.once("error", (error) => {
        clearTimeout(timer);
        reject(
          new GitHubRepositoryWorkspaceError(
            `unable to start git: ${redact(error.message)}`,
          ),
        );
      });
      child.once("close", (exitCode) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new GitHubRepositoryWorkspaceError("git command timed out"));
          return;
        }
        resolveResult({
          exitCode: exitCode ?? -1,
          stdout: redact(stdout),
          stderr: redact(stderr),
        });
      });
    });
  }
}

export class GitHubRepositoryWorkspaceAuthority {
  constructor(
    private readonly runner: GitCommandRunner = new GitCliCommandRunner({
      githubToken: process.env.KINGS_GITHUB_TOKEN,
    }),
  ) {}

  async prepare(
    request: GitHubRepositoryPrepareRequest,
  ): Promise<GitHubRepositoryPrepareResult> {
    const missionId = request.missionId.trim();
    if (!missionId) {
      throw new GitHubRepositoryWorkspaceError("mission id is required");
    }

    const repository = normalizeGitHubRepositoryUrl(request.repository.url);
    const requestedBaseRef = request.repository.baseRef?.trim()
      ? normalizeRef(request.repository.baseRef)
      : undefined;
    let baseRef = requestedBaseRef ?? "";
    const publishBranch = normalizePublishBranch(
      request.repository.publishBranch,
      missionId,
    );
    const workspaceRoot = resolve(request.workspaceRoot);
    const parent = dirname(workspaceRoot);
    await mkdir(parent, { recursive: true });

    let reusedCheckout = false;
    const gitDirectory = join(workspaceRoot, ".git");

    if (await exists(gitDirectory)) {
      reusedCheckout = true;
      const remote = await this.git(
        ["remote", "get-url", "origin"],
        workspaceRoot,
      );
      const existing = normalizeGitHubRepositoryUrl(remote.stdout.trim());
      if (existing.repositoryId.toLowerCase() !== repository.repositoryId.toLowerCase()) {
        throw new GitHubRepositoryWorkspaceError(
          `workspace is already bound to ${existing.repositoryId}, not ${repository.repositoryId}`,
        );
      }

      if (requestedBaseRef) {
        await this.git(["fetch", "--prune", "origin", requestedBaseRef], workspaceRoot);
        baseRef = requestedBaseRef;
      } else {
        await this.git(["fetch", "--prune", "origin"], workspaceRoot);
        const remoteHead = await this.git(
          ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
          workspaceRoot,
        );
        baseRef = normalizeRef(
          remoteHead.stdout.trim().replace(/^origin\//, ""),
        );
        await this.git(["fetch", "origin", baseRef], workspaceRoot);
      }
      await this.git(["switch", "--detach", "FETCH_HEAD"], workspaceRoot);
    } else {
      if (await exists(workspaceRoot)) {
        const entries = await readdir(workspaceRoot);
        if (entries.length > 0) {
          throw new GitHubRepositoryWorkspaceError(
            `workspace "${workspaceRoot}" is not empty and is not an existing Git checkout`,
          );
        }
      }
      await mkdir(workspaceRoot, { recursive: true });
      const cloneArgs = requestedBaseRef
        ? [
            "clone",
            "--no-tags",
            "--branch",
            requestedBaseRef,
            "--single-branch",
            repository.url,
            ".",
          ]
        : ["clone", "--no-tags", repository.url, "."];
      await this.git(cloneArgs, workspaceRoot);

      if (requestedBaseRef) {
        baseRef = requestedBaseRef;
      } else {
        const currentBranch = await this.git(
          ["branch", "--show-current"],
          workspaceRoot,
        );
        baseRef = normalizeRef(currentBranch.stdout.trim());
      }
    }

    const dirty = await this.git(["status", "--porcelain"], workspaceRoot);
    if (dirty.stdout.trim()) {
      throw new GitHubRepositoryWorkspaceError(
        "existing checkout has uncommitted changes; refusing to replace them",
      );
    }

    const existingBranches = await this.git(
      ["branch", "--list", publishBranch],
      workspaceRoot,
    );
    if (existingBranches.stdout.trim()) {
      await this.git(["switch", publishBranch], workspaceRoot);
    } else {
      await this.git(["switch", "-c", publishBranch], workspaceRoot);
    }

    const head = await this.git(["rev-parse", "HEAD"], workspaceRoot);
    const metadata: GitHubRepositoryWorkspaceMetadata = {
      repositoryUrl: repository.url,
      repositoryId: repository.repositoryId,
      baseRef,
      publishBranch,
      publishVerifiedChanges:
        request.repository.publishVerifiedChanges !== false,
      missionId,
      preparedAt: new Date().toISOString(),
    };

    await writeFile(
      join(gitDirectory, METADATA_FILE),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );

    return {
      workspaceRoot,
      metadata,
      headSha: head.stdout.trim(),
      reusedCheckout,
    };
  }

  async readMetadata(
    workspaceRoot: string,
  ): Promise<GitHubRepositoryWorkspaceMetadata | undefined> {
    const path = join(resolve(workspaceRoot), ".git", METADATA_FILE);
    if (!(await exists(path))) return undefined;
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as GitHubRepositoryWorkspaceMetadata;
      if (!parsed.repositoryId || !parsed.publishBranch || !parsed.missionId) {
        throw new Error("missing required metadata fields");
      }
      return parsed;
    } catch (error) {
      throw new GitHubRepositoryWorkspaceError(
        `managed workspace metadata is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async publishVerified(
    workspaceRoot: string,
    options: {
      missionId: string;
      verified: boolean;
      commitMessage?: string;
    },
  ): Promise<GitHubRepositoryPublishResult> {
    const root = resolve(workspaceRoot);
    const metadata = await this.readMetadata(root);
    if (!metadata) {
      return {
        managed: false,
        published: false,
        changedFiles: [],
        message: "Workspace is not a K.I.N.G.S.-managed GitHub checkout.",
      };
    }
    if (metadata.missionId !== options.missionId) {
      throw new GitHubRepositoryWorkspaceError(
        "managed repository mission id does not match the active mission",
      );
    }
    if (!options.verified) {
      throw new GitHubRepositoryWorkspaceError(
        "remote publication is forbidden until project-aware verification passes",
      );
    }

    const changed = await this.git(["status", "--porcelain"], root);
    const changedFiles = changed.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .filter((path) => path && !path.startsWith(".git/"));

    if (changedFiles.length === 0) {
      return {
        managed: true,
        published: true,
        branch: metadata.publishBranch,
        changedFiles: [],
        message:
          "Project-aware verification passed and the repository is already compliant; no new commit or push is required.",
      };
    }

    if (!metadata.publishVerifiedChanges) {
      return {
        managed: true,
        published: false,
        branch: metadata.publishBranch,
        changedFiles,
        message: "Verification passed; automatic GitHub publication is disabled for this mission.",
      };
    }

    await this.git(["add", "--all"], root);
    await this.git(
      [
        "-c",
        "user.name=K.I.N.G.S. AI",
        "-c",
        "user.email=kings-ai@users.noreply.github.com",
        "commit",
        "-m",
        options.commitMessage?.trim() || `K.I.N.G.S. verified build: ${options.missionId}`,
      ],
      root,
    );
    const commit = await this.git(["rev-parse", "HEAD"], root);
    await this.git(
      ["push", "--set-upstream", "origin", `HEAD:refs/heads/${metadata.publishBranch}`],
      root,
    );

    return {
      managed: true,
      published: true,
      branch: metadata.publishBranch,
      commitSha: commit.stdout.trim(),
      changedFiles,
      message:
        `Verified repository changes published to ${metadata.repositoryId} branch ${metadata.publishBranch}.`,
    };
  }

  private async git(
    args: readonly string[],
    workingDirectory: string,
  ): Promise<GitCommandResult> {
    if (args.includes("--force") || args.includes("-f")) {
      throw new GitHubRepositoryWorkspaceError("force operations are forbidden");
    }
    const result = await this.runner.run(args, workingDirectory, {
      network: ["clone", "fetch", "push"].includes(args[0] ?? ""),
    });
    if (result.exitCode !== 0) {
      throw new GitHubRepositoryWorkspaceError(
        `git ${args[0] ?? "command"} failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`,
      );
    }
    return result;
  }
}
