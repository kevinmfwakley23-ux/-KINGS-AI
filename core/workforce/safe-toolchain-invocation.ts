import {
  existsSync,
  readFileSync,
} from "node:fs";

import {
  delimiter,
  dirname,
  join,
} from "node:path";

export interface SafeToolchainInvocation {
  executable: string;
  args: string[];
}

/**
 * Resolves a toolchain executable without ever asking a shell to interpret it.
 *
 * Windows package-manager launchers are commonly .cmd shims. K.I.N.G.S. does
 * not execute or source those shims. Where possible it resolves the underlying
 * Node CLI and invokes that file directly through the current Node executable.
 */
export function safeToolchainInvocation(
  executable: string,
  args: readonly string[],
): SafeToolchainInvocation {
  const copiedArgs = [...args];

  if (process.platform !== "win32") {
    return { executable, args: copiedArgs };
  }

  if (executable === "python3") {
    return {
      executable: "python",
      args: copiedArgs,
    };
  }

  if (executable === "npm" || executable === "npx") {
    const npmExecPath = process.env.npm_execpath;
    if (npmExecPath) {
      const cliPath = executable === "npm"
        ? npmExecPath
        : join(dirname(npmExecPath), "npx-cli.js");

      if (existsSync(cliPath)) {
        return {
          executable: process.execPath,
          args: [cliPath, ...copiedArgs],
        };
      }
    }
  }

  if (executable === "pnpm" || executable === "yarn") {
    const cliPath = resolveWindowsNodeShim(executable);
    if (cliPath) {
      return {
        executable: process.execPath,
        args: [cliPath, ...copiedArgs],
      };
    }
  }

  return { executable, args: copiedArgs };
}

function resolveWindowsNodeShim(
  executable: string,
): string | undefined {
  const pathEntries = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean);

  for (const directory of pathEntries) {
    const shimPath = join(directory, `${executable}.cmd`);
    if (!existsSync(shimPath)) continue;

    try {
      const source = readFileSync(shimPath, "utf8");
      const matches = [
        ...source.matchAll(
          /%~?dp0[\\/]([^"\r\n]+\.(?:cjs|mjs|js))/giu,
        ),
      ];

      const preferred = matches.find((match) =>
        match[1].toLowerCase().includes(executable.toLowerCase()),
      ) ?? matches[0];

      if (!preferred?.[1]) continue;
      const cliPath = join(
        directory,
        preferred[1].replaceAll("\\", "/"),
      );
      if (existsSync(cliPath)) return cliPath;
    } catch {
      // Keep searching PATH. Never execute or source the command shim.
    }
  }

  return undefined;
}