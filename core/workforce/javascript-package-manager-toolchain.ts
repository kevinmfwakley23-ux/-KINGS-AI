import type {
  EngineeringLanguage,
  EngineeringToolchain,
  ToolchainCommand,
  ToolchainOperation,
} from "./engineering-toolchain";

export type JavaScriptPackageManager =
  | "npm"
  | "pnpm"
  | "yarn"
  | "bun";

export interface JavaScriptPackageManagerEvidence {
  packageManagers: readonly string[];
  declaredPackageManager?: string;
}

export interface JavaScriptPackageManagerResolution {
  manager?: JavaScriptPackageManager;
  blockedReason?: string;
}

const MANAGERS = new Set<JavaScriptPackageManager>([
  "npm",
  "pnpm",
  "yarn",
  "bun",
]);

export function resolveJavaScriptPackageManager(
  evidence: JavaScriptPackageManagerEvidence,
): JavaScriptPackageManagerResolution {
  const declared = parseDeclaredManager(
    evidence.declaredPackageManager,
  );

  if (evidence.declaredPackageManager && !declared) {
    return {
      blockedReason:
        `Unsupported packageManager declaration "${evidence.declaredPackageManager}".`,
    };
  }

  const detected = [
    ...new Set(
      evidence.packageManagers.filter(
        (manager): manager is JavaScriptPackageManager =>
          MANAGERS.has(manager as JavaScriptPackageManager),
      ),
    ),
  ];

  if (declared) {
    if (
      detected.length &&
      !detected.includes(declared)
    ) {
      return {
        blockedReason:
          `packageManager declares "${declared}" but detected lockfile evidence is ${detected.join(", ")}. Resolve the repository package-manager conflict before execution.`,
      };
    }
    return { manager: declared };
  }

  if (detected.length > 1) {
    return {
      blockedReason:
        `Multiple JavaScript package managers were detected (${detected.join(", ")}) with no authoritative packageManager declaration.`,
    };
  }

  return {
    manager: detected[0] ?? "npm",
  };
}

export function createJavaScriptPackageManagerToolchain(
  base: EngineeringToolchain,
  manager: JavaScriptPackageManager,
): EngineeringToolchain {
  if (
    base.language !== "typescript" &&
    base.language !== "javascript"
  ) {
    throw new Error(
      `K.I.N.G.S. JavaScript Package Manager Toolchain: language "${base.language}" is not JavaScript/TypeScript`,
    );
  }

  const isTypeScript = base.language === "typescript";
  const commands: ToolchainCommand[] = [
    command("create", runtimeExecutable(manager)),
    binaryCommand(manager, "format", "prettier"),
    binaryCommand(manager, "lint", "eslint"),
    ...(isTypeScript
      ? [binaryCommand(manager, "typecheck", "tsc")]
      : []),
    scriptCommand(manager, "build", "build"),
    command("run", runtimeExecutable(manager)),
    scriptCommand(manager, "test", "test"),
    packCommand(manager),
  ];

  return {
    ...base,
    id: `${base.id}-${manager}`,
    displayName: `${base.displayName} · ${manager}`,
    commands,
  };
}

export function packageManagerCommandCapability(
  command: ToolchainCommand,
): string | undefined {
  const executable = command.command;

  if (executable === "npx" && command.args[0]) {
    return `npx-package:${command.args[0]}`;
  }
  if (
    executable === "pnpm" &&
    command.args[0] === "exec" &&
    command.args[1]
  ) {
    return `pnpm-package:${command.args[1]}`;
  }
  if (
    executable === "yarn" &&
    command.args[0] === "run" &&
    command.args[1] &&
    !isProjectScriptOperation(command.operation)
  ) {
    return `yarn-package:${command.args[1]}`;
  }
  if (
    executable === "bun" &&
    command.args[0] === "x" &&
    command.args.includes("--no-install")
  ) {
    const packageName = command.args.at(-1);
    if (packageName) return `bun-package:${packageName}`;
  }

  const script = packageManagerScriptName(command);
  if (script) {
    return `${executable}-script:${script}`;
  }

  return undefined;
}

export function packageManagerScriptName(
  command: ToolchainCommand,
): string | undefined {
  if (
    !["npm", "pnpm", "yarn", "bun"].includes(command.command)
  ) {
    return undefined;
  }

  if (
    command.args[0] === "run" &&
    command.args[1]
  ) {
    return command.args[1];
  }

  if (
    command.command === "npm" &&
    command.args[0] === "test"
  ) {
    return "test";
  }

  return undefined;
}

export function packageManagerBinaryProbeArgs(
  command: ToolchainCommand,
): string[] | undefined {
  switch (command.command) {
    case "npx":
      return command.args[0]
        ? ["--no-install", command.args[0], "--version"]
        : undefined;
    case "pnpm":
      return command.args[0] === "exec" && command.args[1]
        ? ["exec", command.args[1], "--version"]
        : undefined;
    case "yarn":
      return command.args[0] === "run" &&
        command.args[1] &&
        !isProjectScriptOperation(command.operation)
        ? ["run", command.args[1], "--version"]
        : undefined;
    case "bun": {
      const packageName = command.args[0] === "x"
        ? command.args.at(-1)
        : undefined;
      return packageName
        ? ["x", "--no-install", packageName, "--version"]
        : undefined;
    }
    default:
      return undefined;
  }
}

function parseDeclaredManager(
  value: string | undefined,
): JavaScriptPackageManager | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  const separator = normalized.indexOf("@");
  const manager = (
    separator > 0
      ? normalized.slice(0, separator)
      : normalized
  ) as JavaScriptPackageManager;
  return MANAGERS.has(manager)
    ? manager
    : undefined;
}

function binaryCommand(
  manager: JavaScriptPackageManager,
  operation: ToolchainOperation,
  binary: string,
): ToolchainCommand {
  switch (manager) {
    case "npm":
      return command(operation, "npx", [binary]);
    case "pnpm":
      return command(operation, "pnpm", ["exec", binary]);
    case "yarn":
      return command(operation, "yarn", ["run", binary]);
    case "bun":
      return command(operation, "bun", ["x", "--no-install", binary]);
  }
}

function scriptCommand(
  manager: JavaScriptPackageManager,
  operation: ToolchainOperation,
  script: string,
): ToolchainCommand {
  return command(operation, manager, ["run", script]);
}

function packCommand(
  manager: JavaScriptPackageManager,
): ToolchainCommand {
  if (manager === "bun") {
    return command("package", "bun", ["pm", "pack"]);
  }
  return command("package", manager, ["pack"]);
}

function runtimeExecutable(
  manager: JavaScriptPackageManager,
): string {
  return manager === "bun"
    ? "bun"
    : "node";
}

function isProjectScriptOperation(
  operation: ToolchainOperation,
): boolean {
  return operation === "build" ||
    operation === "test";
}

function command(
  operation: ToolchainOperation,
  executable: string,
  args: string[] = [],
): ToolchainCommand {
  return {
    operation,
    command: executable,
    args,
    requiresCompilation: operation === "build",
  };
}
