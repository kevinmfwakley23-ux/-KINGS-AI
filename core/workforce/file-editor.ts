import {
  dirname,
  resolve,
  relative,
  isAbsolute,
} from "node:path";

import {
  readFile,
  writeFile,
  mkdir,
  unlink,
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

export interface FileDeleteRequest {
  path: string;
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

export interface FileDeleteResult {
  path: string;
  deleted: boolean;
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

function assertPathAllowed(
  path: string,
  allowedPaths: string[],
  operation: "read" | "write" | "delete",
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

  if (
    !allowedPaths.some(
      (allowedRoot) =>
        isPathWithin(
          normalized,
          allowedRoot,
        ),
    )
  ) {
    throw new FileEditorPolicyError(
      `${operation} path "${normalized}" is not authorized`,
    );
  }

  return normalized;
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

  authorizeDelete(
    request:
      FileDeleteRequest,
  ): string {
    if (
      !request.path.trim()
    ) {
      throw new FileEditorPolicyError(
        "delete path is required",
      );
    }

    return assertPathAllowed(
      request.path,
      this.policy.allowedWritePaths,
      "delete",
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

    await mkdir(
      dirname(
        path,
      ),
      {
        recursive:
          true,
      },
    );

    await writeFile(
      path,
      request.content,
      "utf8",
    );

    return {
      path,
      bytesWritten:
        bytes,
    };
  }

  async delete(
    request:
      FileDeleteRequest,
  ): Promise<FileDeleteResult> {
    const path =
      this.authorizeDelete(
        request,
      );

    try {
      await unlink(
        path,
      );

      return {
        path,
        deleted:
          true,
      };
    } catch (
      error
    ) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return {
          path,
          deleted:
            false,
        };
      }

      throw error;
    }
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
      return true;
    } catch {
      return false;
    }
  }
}
