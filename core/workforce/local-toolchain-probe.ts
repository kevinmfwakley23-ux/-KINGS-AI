import {
  readFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  spawnSync,
} from "node:child_process";

import type {
  EngineeringLanguage,
  EngineeringToolchainRegistry,
  ToolchainCommand,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  ToolchainProbe,
} from "./toolchain-verification";

export interface ToolchainProbeProcessResult {
  started: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface ToolchainProbeProcessRunner {
  run(
    executable: string,
    args: string[],
    workingDirectory?: string,
  ): ToolchainProbeProcessResult;
}

export interface LocalToolchainProbeRequest {
  language: EngineeringLanguage;
  requiredOperations: ToolchainOperation[];
  workingDirectory?: string;
}

export class NodeToolchainProbeProcessRunner
  implements ToolchainProbeProcessRunner {
  run(
    executable: string,
    args: string[],
    workingDirectory?: string,
  ): ToolchainProbeProcessResult {
    const result = spawnSync(executable, args, {
      cwd: workingDirectory,
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });

    return {
      started: result.error === undefined,
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? result.error?.message ?? "",
    };
  }
}

export class LocalToolchainProbeAuthority {
  constructor(
    private readonly registry: EngineeringToolchainRegistry,
    private readonly runner: ToolchainProbeProcessRunner =
      new NodeToolchainProbeProcessRunner(),
  ) {}

  probe(
    request: LocalToolchainProbeRequest,
  ): ToolchainProbe[] {
    const discovery = this.registry.discover({
      language: request.language,
      requiredOperations: request.requiredOperations,
    });

    const requiredCommands = discovery.toolchain.commands.filter(
      (command) => request.requiredOperations.includes(command.operation),
    );

    const grouped = new Map<string, ToolchainCommand[]>();
    for (const command of requiredCommands) {
      const commands = grouped.get(command.command) ?? [];
      commands.push(command);
      grouped.set(command.command, commands);
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([executable, commands]) =>
        this.probeExecutable(
          executable,
          commands,
          request.workingDirectory,
        ),
      );
  }

  private probeExecutable(
    executable: string,
    commands: ToolchainCommand[],
    workingDirectory?: string,
  ): ToolchainProbe {
    const versionResult = this.runner.run(
      executable,
      versionArgs(executable),
      workingDirectory,
    );

    if (!versionResult.started) {
      return {
        executable,
        available: false,
      };
    }

    const capabilities = new Set<string>();

    for (const command of commands) {
      this.probeCommandCapabilities(
        executable,
        command,
        workingDirectory,
        capabilities,
      );
    }

    return {
      executable,
      available: true,
      version: firstLine(versionResult.stdout, versionResult.stderr),
      capabilities: [...capabilities].sort(),
    };
  }

  private probeCommandCapabilities(
    executable: string,
    command: ToolchainCommand,
    workingDirectory: string | undefined,
    capabilities: Set<string>,
  ): void {
    const moduleIndex = command.args.indexOf("-m");
    const moduleName = moduleIndex >= 0
      ? command.args[moduleIndex + 1]
      : undefined;

    if (moduleName) {
      const moduleProbe = this.runner.run(
        executable,
        ["-m", moduleName, "--version"],
        workingDirectory,
      );
      if (moduleProbe.started && moduleProbe.status === 0) {
        capabilities.add(`python-module:${moduleName}`);
      }
    }

    if (executable === "npx" && command.args[0]) {
      const packageName = command.args[0];
      const packageProbe = this.runner.run(
        executable,
        ["--no-install", packageName, "--version"],
        workingDirectory,
      );
      if (packageProbe.started && packageProbe.status === 0) {
        capabilities.add(`npx-package:${packageName}`);
      }
    }

    if (executable === "npm") {
      const scriptName = npmScriptName(command);
      if (
        scriptName &&
        workingDirectory &&
        projectHasNpmScript(workingDirectory, scriptName)
      ) {
        capabilities.add(`npm-script:${scriptName}`);
      }
    }
  }
}

function npmScriptName(
  command: ToolchainCommand,
): string | undefined {
  if (command.args[0] === "run" && command.args[1]) {
    return command.args[1];
  }
  if (command.args[0] === "test") {
    return "test";
  }
  return undefined;
}

function projectHasNpmScript(
  workingDirectory: string,
  scriptName: string,
): boolean {
  try {
    const raw = readFileSync(
      join(workingDirectory, "package.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as {
      scripts?: Record<string, unknown>;
    };
    return typeof parsed.scripts?.[scriptName] === "string";
  } catch {
    return false;
  }
}

function versionArgs(
  executable: string,
): string[] {
  if (executable === "go") return ["version"];
  if (executable === "java" || executable === "javac") {
    return ["-version"];
  }
  if (executable === "gofmt") return ["-h"];
  return ["--version"];
}

function firstLine(
  stdout: string,
  stderr: string,
): string | undefined {
  const text = (stdout.trim() || stderr.trim());
  if (!text) return undefined;
  return text.split(/\r?\n/, 1)[0];
}
