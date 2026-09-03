import type {
  ID,
} from "./types";

export type EngineeringLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "c"
  | "cpp"
  | "css"
  | "html"
  | "sql"
  | "shell"
  | "json"
  | "yaml"
  | "markdown"
  | "text";

export type ToolchainOperation =
  | "create"
  | "format"
  | "lint"
  | "typecheck"
  | "compile"
  | "build"
  | "run"
  | "test"
  | "package";

export interface ToolchainCommand {
  operation:
    ToolchainOperation;
  command:
    string;
  args:
    string[];
  requiresCompilation:
    boolean;
}

export interface EngineeringToolchain {
  id:
    ID;
  language:
    EngineeringLanguage;
  displayName:
    string;
  fileExtensions:
    string[];
  commands:
    ToolchainCommand[];
  enabled:
    boolean;
}

export interface ToolchainDiscoveryRequest {
  language:
    EngineeringLanguage;
  requiredOperations:
    ToolchainOperation[];
}

export interface ToolchainDiscoveryResult {
  toolchain:
    EngineeringToolchain;
  supported:
    boolean;
  missingOperations:
    ToolchainOperation[];
}

export class EngineeringToolchainRegistry {
  private readonly toolchains =
    new Map<
      EngineeringLanguage,
      EngineeringToolchain
    >();

  register(
    toolchain:
      EngineeringToolchain,
  ): void {
    if (
      this.toolchains.has(
        toolchain.language,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Toolchain: language "${toolchain.language}" is already registered`,
      );
    }

    if (
      !toolchain.enabled
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Toolchain: language "${toolchain.language}" must be enabled`,
      );
    }

    this.toolchains.set(
      toolchain.language,
      {
        ...toolchain,
        fileExtensions: [
          ...toolchain.fileExtensions,
        ],
        commands:
          toolchain.commands.map(
            (command) => ({
              ...command,
              args: [
                ...command.args,
              ],
            }),
          ),
      },
    );
  }

  get(
    language:
      EngineeringLanguage,
  ):
    EngineeringToolchain |
    undefined {
    const toolchain =
      this.toolchains.get(
        language,
      );

    if (!toolchain) {
      return undefined;
    }

    return {
      ...toolchain,
      fileExtensions: [
        ...toolchain.fileExtensions,
      ],
      commands:
        toolchain.commands.map(
          (command) => ({
            ...command,
            args: [
              ...command.args,
            ],
          }),
    };
  }

  list():
    EngineeringToolchain[] {
    return [
      ...this.toolchains.values(),
    ].map(
      (toolchain) => ({
        ...toolchain,
        fileExtensions: [
          ...toolchain.fileExtensions,
        ],
        commands:
          toolchain.commands.map(
            (command) => ({
              ...command,
              args: [
                ...command.args,
              ],
            }),
      }),
    );
  }

  discover(
    request:
      ToolchainDiscoveryRequest,
  ):
    ToolchainDiscoveryResult {
    const toolchain =
      this.get(
        request.language,
      );

    if (!toolchain) {
      throw new Error(
        `K.I.N.G.S. Engineering Toolchain: language "${request.language}" is not registered`,
      );
    }

    const supported =
      new Set(
        toolchain.commands.map(
          (command) =>
            command.operation,
        ),
      );

    const missingOperations =
      request.requiredOperations.filter(
        (operation) =>
          !supported.has(
            operation,
          ),
      );

    return {
      toolchain,
      supported:
        missingOperations.length ===
        0,
      missingOperations,
    };
  }
}

function command(
  operation:
    ToolchainOperation,
  executable:
    string,
  args:
    string[] = [],
  requiresCompilation:
    boolean = false,
):
  ToolchainCommand {
  return {
    operation,
    command:
      executable,
    args,
    requiresCompilation,
  };
}

export function createDefaultEngineeringToolchains():
  EngineeringToolchain[] {
  return [
    {
      id:
        "engineering-typescript",
      language:
        "typescript",
      displayName:
        "TypeScript",
      fileExtensions: [
        ".ts",
        ".tsx",
      ],
      commands: [
        command(
          "create",
          "node",
        ),
        command(
          "typecheck",
          "npx",
          [
            "tsc",
            "--noEmit",
          ],
        ),
        command(
          "compile",
          "npx",
          [
            "tsc",
          ],
          true,
        ),
        command(
          "build",
          "npm",
          [
            "run",
            "build",
          ],
          true,
        ),
        command(
          "test",
          "npm",
          [
            "test",
          ],
        ),
      ],
      enabled:
        true,
    },
    {
      id:
        "engineering-javascript",
      language:
        "javascript",
      displayName:
        "JavaScript",
      fileExtensions: [
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
      ],
      commands: [
        command(
          "create",
          "node",
        ),
        command(
          "run",
          "node",
        ),
        command(
          "test",
          "npm",
          [
            "test",
          ],
        ),
      ],
      enabled:
        true,
    },
    {
      id:
        "engineering-python",
      language:
        "python",
      displayName:
        "Python",
      fileExtensions: [
        ".py",
      ],
      commands: [
        command(
          "create",
          "python3",
        ),
        command(
          "run",
          "python3",
        ),
        command(
          "test",
          "python3",
          [
            "-m",
            "pytest",
          ],
        ),
      ],
      enabled:
        true,
    },
    {
      id:
        "engineering-rust",
      language:
        "rust",
      displayName:
        "Rust",
      fileExtensions: [
        ".rs",
      ],
      commands: [
        command(
          "create",
          "cargo",
        ),
        command(
          "compile",
          "cargo",
          [
            "check",
          ],
          true,
        ),
        command(
          "build",
          "cargo",
          [
            "build",
          ],
          true,
        ),
        command(
          "test",
          "cargo",
          [
            "test",
          ],
        ),
      ],
      enabled:
        true,
    },
    {
      id:
        "engineering-go",
      language:
        "go",
      displayName:
        "Go",
      fileExtensions: [
        ".go",
      ],
      commands: [
        command(
          "create",
          "go",
        ),
        command(
          "build",
          "go",
          [
            "build",
            "./...",
          ],
          true,
        ),
        command(
          "test",
          "go",
          [
            "test",
            "./...",
          ],
        ),
      ],
      enabled:
        true,
    },
  ];
}
