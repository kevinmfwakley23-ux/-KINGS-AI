import type {
  ID,
} from "./types";

// Open by design: V1's locked hard gate requires adding languages/toolchains
// without changing K.I.N.G.S. core. Default language IDs are registered below,
// but verified dynamic capabilities may introduce additional IDs at runtime.
export type EngineeringLanguage = ID;

export type ToolchainOperation =
  | "create"
  | "replace"
  | "format"
  | "lint"
  | "typecheck"
  | "compile"
  | "build"
  | "run"
  | "test"
  | "package";

export interface ToolchainCommand {
  operation: ToolchainOperation;
  command: string;
  args: string[];
  requiresCompilation: boolean;
}

export interface EngineeringToolchain {
  id: ID;
  language: EngineeringLanguage;
  displayName: string;
  fileExtensions: string[];
  commands: ToolchainCommand[];
  enabled: boolean;
}

export interface ToolchainDiscoveryRequest {
  language: EngineeringLanguage;
  requiredOperations: ToolchainOperation[];
}

export interface ToolchainDiscoveryResult {
  toolchain: EngineeringToolchain;
  supported: boolean;
  missingOperations: ToolchainOperation[];
}

export class EngineeringToolchainRegistry {
  private readonly toolchains = new Map<EngineeringLanguage, EngineeringToolchain>();

  register(toolchain: EngineeringToolchain): void {
    const language = toolchain.language.trim();
    if (!language) {
      throw new Error("K.I.N.G.S. Engineering Toolchain: language id is required");
    }
    if (this.toolchains.has(language)) {
      throw new Error(
        `K.I.N.G.S. Engineering Toolchain: language "${language}" is already registered`,
      );
    }
    if (!toolchain.enabled) {
      throw new Error(
        `K.I.N.G.S. Engineering Toolchain: language "${language}" must be enabled`,
      );
    }
    if (!toolchain.id.trim() || !toolchain.displayName.trim()) {
      throw new Error(
        `K.I.N.G.S. Engineering Toolchain: toolchain id and display name are required for "${language}"`,
      );
    }
    if (toolchain.fileExtensions.length === 0) {
      throw new Error(
        `K.I.N.G.S. Engineering Toolchain: language "${language}" requires at least one file extension`,
      );
    }
    if (toolchain.commands.length === 0) {
      throw new Error(
        `K.I.N.G.S. Engineering Toolchain: language "${language}" requires at least one executable operation`,
      );
    }

    this.toolchains.set(language, {
      ...toolchain,
      language,
      fileExtensions: [...toolchain.fileExtensions],
      commands: toolchain.commands.map((entry) => ({
        ...entry,
        args: [...entry.args],
      })),
    });
  }

  get(language: EngineeringLanguage): EngineeringToolchain | undefined {
    const toolchain = this.toolchains.get(language.trim());
    if (!toolchain) return undefined;
    return {
      ...toolchain,
      fileExtensions: [...toolchain.fileExtensions],
      commands: toolchain.commands.map((entry) => ({
        ...entry,
        args: [...entry.args],
      })),
    };
  }

  list(): EngineeringToolchain[] {
    return [...this.toolchains.values()]
      .sort((left, right) => left.language.localeCompare(right.language))
      .map((toolchain) => ({
        ...toolchain,
        fileExtensions: [...toolchain.fileExtensions],
        commands: toolchain.commands.map((entry) => ({
          ...entry,
          args: [...entry.args],
        })),
      }));
  }

  discover(request: ToolchainDiscoveryRequest): ToolchainDiscoveryResult {
    const toolchain = this.get(request.language);
    if (!toolchain) {
      throw new Error(
        `K.I.N.G.S. Engineering Toolchain: language "${request.language}" is not registered`,
      );
    }
    const supported = new Set(toolchain.commands.map((entry) => entry.operation));
    const missingOperations = request.requiredOperations.filter(
      (operation) => !supported.has(operation),
    );
    return {
      toolchain,
      supported: missingOperations.length === 0,
      missingOperations,
    };
  }
}

function command(
  operation: ToolchainOperation,
  executable: string,
  args: string[] = [],
  requiresCompilation = false,
): ToolchainCommand {
  return {
    operation,
    command: executable,
    args,
    requiresCompilation,
  };
}

export function createDefaultEngineeringToolchains(): EngineeringToolchain[] {
  return [
    {
      id: "toolchain-typescript",
      language: "typescript",
      displayName: "TypeScript",
      fileExtensions: [".ts", ".tsx"],
      commands: [
        command("create", "node"),
        command("format", "npx", ["prettier"]),
        command("lint", "npx", ["eslint"]),
        command("typecheck", "npx", ["tsc"]),
        command("build", "npm", ["run", "build"]),
        command("run", "node"),
        command("test", "npm", ["test"]),
        command("package", "npm", ["pack"]),
      ],
      enabled: true,
    },
    {
      id: "toolchain-javascript",
      language: "javascript",
      displayName: "JavaScript",
      fileExtensions: [".js", ".jsx", ".mjs", ".cjs"],
      commands: [
        command("create", "node"),
        command("format", "npx", ["prettier"]),
        command("lint", "npx", ["eslint"]),
        command("run", "node"),
        command("test", "npm", ["test"]),
        command("package", "npm", ["pack"]),
      ],
      enabled: true,
    },
    {
      id: "toolchain-python",
      language: "python",
      displayName: "Python",
      fileExtensions: [".py"],
      commands: [
        command("create", "python3"),
        command("format", "python3", ["-m", "black"]),
        command("lint", "python3", ["-m", "ruff"]),
        command("run", "python3"),
        command("test", "python3", ["-m", "pytest"]),
        command("package", "python3", ["-m", "build"]),
      ],
      enabled: true,
    },
    {
      id: "toolchain-rust",
      language: "rust",
      displayName: "Rust",
      fileExtensions: [".rs"],
      commands: [
        command("create", "cargo", ["new"]),
        command("format", "cargo", ["fmt"]),
        command("lint", "cargo", ["clippy"]),
        command("compile", "rustc", [], true),
        command("build", "cargo", ["build"], true),
        command("run", "cargo", ["run"], true),
        command("test", "cargo", ["test"], true),
        command("package", "cargo", ["package"], true),
      ],
      enabled: true,
    },
    {
      id: "toolchain-go",
      language: "go",
      displayName: "Go",
      fileExtensions: [".go"],
      commands: [
        command("create", "go", ["mod", "init"]),
        command("format", "gofmt"),
        command("lint", "go", ["vet", "./..."]),
        command("compile", "go", ["build"], true),
        command("build", "go", ["build"], true),
        command("run", "go", ["run", "."]),
        command("test", "go", ["test", "./..."]),
        command("package", "go", ["build"], true),
      ],
      enabled: true,
    },
    {
      id: "toolchain-java",
      language: "java",
      displayName: "Java",
      fileExtensions: [".java"],
      commands: [
        command("create", "java"),
        command("compile", "javac", [], true),
        command("build", "javac", [], true),
        command("run", "java"),
        command("test", "mvn", ["test"]),
        command("package", "mvn", ["package"], true),
      ],
      enabled: true,
    },
    {
      id: "toolchain-c",
      language: "c",
      displayName: "C",
      fileExtensions: [".c", ".h"],
      commands: [
        command("compile", "gcc", [], true),
        command("build", "gcc", [], true),
        command("run", "gcc", [], true),
        command("test", "make", ["test"]),
        command("package", "make", ["package"]),
      ],
      enabled: true,
    },
    {
      id: "toolchain-cpp",
      language: "cpp",
      displayName: "C++",
      fileExtensions: [".cpp", ".hpp"],
      commands: [
        command("compile", "g++", [], true),
        command("build", "g++", [], true),
        command("run", "g++", [], true),
        command("test", "ctest"),
        command("package", "cmake", ["--build"], true),
      ],
      enabled: true,
    },
    {
      id: "toolchain-shell",
      language: "shell",
      displayName: "Shell",
      fileExtensions: [".sh", ".bash"],
      commands: [
        command("create", "bash"),
        command("lint", "shellcheck"),
        command("run", "bash"),
        command("test", "bash"),
      ],
      enabled: true,
    },
    {
      id: "toolchain-html",
      language: "html",
      displayName: "HTML",
      fileExtensions: [".html", ".htm"],
      commands: [
        command("create", "node"),
        command("format", "npx", ["prettier"]),
        command("lint", "npx", ["html-validate"]),
        command("test", "npx", ["html-validate"]),
      ],
      enabled: true,
    },
    {
      id: "toolchain-css",
      language: "css",
      displayName: "CSS",
      fileExtensions: [".css"],
      commands: [
        command("create", "node"),
        command("format", "npx", ["prettier"]),
        command("lint", "npx", ["stylelint"]),
        command("test", "npx", ["stylelint"]),
      ],
      enabled: true,
    },
    {
      id: "toolchain-sql",
      language: "sql",
      displayName: "SQL",
      fileExtensions: [".sql"],
      commands: [
        command("create", "sqlite3"),
        command("run", "sqlite3"),
        command("test", "sqlite3"),
      ],
      enabled: true,
    },
  ];
}
