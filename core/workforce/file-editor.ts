import {
  dirname,
  join,
  resolve,
  relative,
  isAbsolute,
} from "node:path";

import {
  readFile,
  writeFile,
  mkdir,
  lstat,
  realpath,
  access,
} from "node:fs/promises";

export interface FileEditorPolicy {
  allowedReadPaths: string[];
  allowedWritePaths: string[];
  maxFileBytes: number;
}

export interface FileReadRequest {
  path: string;
}

export interface FileWriteRequest {
  path: string;
  content: string;
}

export interface FileReadResult {
  path: string;
  content: string;
  bytes: number;
}

export interface FileWriteResult {
  path: string;
  bytesWritten: number;
}

export class FileEditorPolicyError
  extends Error {
  constructor(
    message: string,
  ) {
    super(
      `K.I.N.G.S. File Editor: ${message}`,
    );

    this.name =
      "FileEditorPolicyError";
  }
}

function normalizePath(
  path: string,
): string {
  return resolve(
    path,
  );
}

function isPathWithin(
  candidate: string,
  allowedRoot: string,
): boolean {
  const relativePath =
    relative(
      normalizePath(
        allowedRoot,
      ),
      normalizePath(
        candidate,
      ),
    );

  return (
    relativePath === "" ||
    (
      !relativePath.startsWith(
        "..",
      ) &&
      !isAbsolute(
        relativePath,
      )
    )
  );
}

function matchingAllowedRoot(
  normalizedPath: string,
  allowedPaths: string[],
): string | undefined {
  return allowedPaths
    .map(normalizePath)
    .filter((allowedRoot) => isPathWithin(normalizedPath, allowedRoot))
    .sort((left, right) => right.length - left.length)[0];
}

function assertPathAllowed(
  path: string,
  allowedPaths: string[],
  operation: "read" | "write",
): string {
  const normalized =
    normalizePath(
      path,
    );

  if (
    allowedPaths.length ===
    0
  ) {
    throw new FileEditorPolicyError(
      `${operation} operation has no authorized paths`,
    );
  }

  if (!matchingAllowedRoot(normalized, allowedPaths)) {
    throw new FileEditorPolicyError(
      `${operation} path "${normalized}" is not authorized`,
    );
  }

  return normalized;
}

async function assertExistingRealPathAllowed(
  path: string,
  allowedPaths: string[],
  operation: "read" | "write",
): Promise<void> {
  const lexicalRoot = matchingAllowedRoot(path, allowedPaths);
  if (!lexicalRoot) {
    throw new FileEditorPolicyError(
      `${operation} path "${path}" is not authorized`,
    );
  }

  const pathStat = await lstat(path);
  if (pathStat.isSymbolicLink()) {
    throw new FileEditorPolicyError(
      `${operation} path "${path}" is a symbolic link`,
    );
  }

  const [realRoot, realTarget] = await Promise.all([
    realpath(lexicalRoot),
    realpath(path),
  ]);
  if (!isPathWithin(realTarget, realRoot)) {
    throw new FileEditorPolicyError(
      `${operation} path "${path}" resolves outside its authorized root`,
    );
  }
}

async function ensureSafeWriteParent(
  target: string,
  allowedPaths: string[],
): Promise<void> {
  const lexicalRoot = matchingAllowedRoot(target, allowedPaths);
  if (!lexicalRoot) {
    throw new FileEditorPolicyError(
      `write path "${target}" is not authorized`,
    );
  }

  await mkdir(lexicalRoot, { recursive: true });
  const rootStat = await lstat(lexicalRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new FileEditorPolicyError(
      `authorized write root "${lexicalRoot}" must be a real directory`,
    );
  }
  const realRoot = await realpath(lexicalRoot);
  const parent = dirname(target);
  const relParent = relative(lexicalRoot, parent);
  const segments = relParent === ""
    ? []
    : relParent.split(/[\\/]+/).filter(Boolean);

  let current = lexicalRoot;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) {
        throw new FileEditorPolicyError(
          `write path "${target}" crosses symbolic link "${current}"`,
        );
      }
      if (!entry.isDirectory()) {
        throw new FileEditorPolicyError(
          `write parent "${current}" is not a directory`,
        );
      }
    } catch (error) {
      if (
        error instanceof FileEditorPolicyError ||
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
      await mkdir(current);
    }

    const realCurrent = await realpath(current);
    if (!isPathWithin(realCurrent, realRoot)) {
      throw new FileEditorPolicyError(
        `write path "${target}" resolves outside its authorized root`,
      );
    }
  }

  try {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink()) {
      throw new FileEditorPolicyError(
        `write path "${target}" is a symbolic link`,
      );
    }
    if (targetStat.isDirectory()) {
      throw new FileEditorPolicyError(
        `write path "${target}" is a directory`,
      );
    }
    await assertExistingRealPathAllowed(target, allowedPaths, "write");
  } catch (error) {
    if (
      error instanceof FileEditorPolicyError ||
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

export class ControlledFileEditor {
  constructor(
    private readonly policy:
      FileEditorPolicy,
  ) {
    if (
      !Number.isInteger(
        policy.maxFileBytes,
      ) ||
      policy.maxFileBytes <
        1
    ) {
      throw new FileEditorPolicyError(
        "maxFileBytes must be a positive integer",
      );
    }
  }

  authorizeRead(
    request:
      FileReadRequest,
  ): string {
    if (
      !request.path.trim()
    ) {
      throw new FileEditorPolicyError(
        "read path is required",
      );
    }

    return assertPathAllowed(
      request.path,
      this.policy.allowedReadPaths,
      "read",
    );
  }

  authorizeWrite(
    request:
      FileWriteRequest,
  ): string {
    if (
      !request.path.trim()
    ) {
      throw new FileEditorPolicyError(
        "write path is required",
      );
    }

    return assertPathAllowed(
      request.path,
      this.policy.allowedWritePaths,
      "write",
    );
  }

  async read(
    request:
      FileReadRequest,
  ): Promise<FileReadResult> {
    const path =
      this.authorizeRead(
        request,
      );

    await assertExistingRealPathAllowed(
      path,
      this.policy.allowedReadPaths,
      "read",
    );

    const content =
      await readFile(
        path,
        "utf8",
      );

    const bytes =
      Buffer.byteLength(
        content,
        "utf8",
      );

    if (
      bytes >
      this.policy.maxFileBytes
    ) {
      throw new FileEditorPolicyError(
        `file "${path}" exceeds maximum allowed size of ${this.policy.maxFileBytes} bytes`,
      );
    }

    return {
      path,
      content,
      bytes,
    };
  }

  async write(
    request:
      FileWriteRequest,
  ): Promise<FileWriteResult> {
    const path =
      this.authorizeWrite(
        request,
      );

    const bytes =
      Buffer.byteLength(
        request.content,
        "utf8",
      );

    if (
      bytes >
      this.policy.maxFileBytes
    ) {
      throw new FileEditorPolicyError(
        `file "${path}" exceeds maximum allowed size of ${this.policy.maxFileBytes} bytes`,
      );
    }

    await ensureSafeWriteParent(
      path,
      this.policy.allowedWritePaths,
    );

    await writeFile(
      path,
      request.content,
      "utf8",
    );

    await assertExistingRealPathAllowed(
      path,
      this.policy.allowedWritePaths,
      "write",
    );

    return {
      path,
      bytesWritten:
        bytes,
    };
  }

  async exists(
    request:
      FileReadRequest,
  ): Promise<boolean> {
    const path =
      this.authorizeRead(
        request,
      );

    try {
      await access(
        path,
      );
      await assertExistingRealPathAllowed(
        path,
        this.policy.allowedReadPaths,
        "read",
      );
      return true;
    } catch (error) {
      if (error instanceof FileEditorPolicyError) throw error;
      return false;
    }
  }
}
