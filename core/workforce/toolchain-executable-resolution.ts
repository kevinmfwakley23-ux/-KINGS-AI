import {
  access,
} from "node:fs/promises";

import {
  constants,
} from "node:fs";

import {
  delimiter,
} from "node:path";

export interface ToolchainExecutableResolutionRequest {
  executable:
    string;

  environment?:
    Record<string, string>;
}

export interface ToolchainExecutableResolutionResult {
  requested:
    string;

  resolved:
    string;

  pathEnvironment:
    string;

  verified:
    boolean;
}

export class ToolchainExecutableResolutionError
  extends Error {
  constructor(
    message:
      string,
  ) {
    super(
      `K.I.N.G.S. Toolchain Executable Resolution: ${message}`,
    );

    this.name =
      "ToolchainExecutableResolutionError";
  }
}

function pathEnvironment(
  environment?:
    Record<string, string>,
):
  string {
  return (
    environment?.PATH ??
    process.env.PATH ??
    ""
  );
}

function candidates(
  executable:
    string,
    path:
      string,
):
  string[] {
  if (
    executable.includes("/")
  ) {
    return [
      executable,
    ];
  }

  return path
    .split(delimiter)
    .filter(Boolean)
    .map(
      (entry) =>
        `${entry}/${executable}`,
    );
}

export async function resolveToolchainExecutable(
  request:
    ToolchainExecutableResolutionRequest,
):
  Promise<ToolchainExecutableResolutionResult> {
  const resolvedPath =
    pathEnvironment(
      request.environment,
    );

  for (
    const candidate of
      candidates(
        request.executable,
        resolvedPath,
      )
  ) {
    try {
      await access(
        candidate,
        constants.X_OK,
      );

      return {
        requested:
          request.executable,
        resolved:
          candidate,
        pathEnvironment:
          resolvedPath,
        verified:
          true,
      };
    } catch {
      // Continue searching.
    }
  }

  throw new ToolchainExecutableResolutionError(
    `executable "${request.executable}" could not be resolved`,
  );
}
