import type {
  ID,
} from "./types";

export interface EngineeringLanguageDefinition {
  id:
    ID;
  displayName:
    string;
  fileExtensions:
    string[];
  aliases:
    string[];
  enabled:
    boolean;
}

export class EngineeringLanguageRegistry {
  private readonly languages =
    new Map<
      ID,
      EngineeringLanguageDefinition
    >();

  register(
    language:
      EngineeringLanguageDefinition,
  ):
    void {
    if (
      !language.id.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Language: language id is required",
      );
    }

    if (
      !language.displayName.trim()
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Language: display name is required for "${language.id}"`,
      );
    }

    if (
      !language.enabled
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Language: language "${language.id}" must be enabled`,
      );
    }

    if (
      this.languages.has(
        language.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Language: language "${language.id}" is already registered`,
      );
    }

    this.languages.set(
      language.id,
      {
        ...language,
        fileExtensions: [
          ...language.fileExtensions,
        ],
        aliases: [
          ...language.aliases,
        ],
      },
    );
  }

  get(
    languageId:
      ID,
  ):
    EngineeringLanguageDefinition
    | undefined {
    const language =
      this.languages.get(
        languageId,
      );

    if (!language) {
      return undefined;
    }

    return {
      ...language,
      fileExtensions: [
        ...language.fileExtensions,
      ],
      aliases: [
        ...language.aliases,
      ],
    };
  }

  resolve(
    value:
      string,
  ):
    EngineeringLanguageDefinition
    | undefined {
    const normalized =
      value
        .trim()
        .toLowerCase();

    return [
      ...this.languages.values(),
    ]
      .sort(
        (a, b) =>
          a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0,
      )
      .find(
        (language) =>
          language.id.toLowerCase() ===
            normalized ||
          language.aliases.some(
            (alias) =>
              alias.toLowerCase() ===
              normalized,
          ),
      );
  }

  detectByExtension(
    extension:
      string,
  ):
    EngineeringLanguageDefinition
    | undefined {
    const normalized =
      extension
        .trim()
        .toLowerCase()
        .startsWith(".")
        ? extension
            .trim()
            .toLowerCase()
        : `.${extension
            .trim()
            .toLowerCase()}`;

    return [
      ...this.languages.values(),
    ]
      .sort(
        (a, b) =>
          a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0,
      )
      .find(
        (language) =>
          language.fileExtensions
            .some(
              (candidate) =>
                candidate
                  .toLowerCase() ===
                normalized,
            ),
      );
  }

  list():
    EngineeringLanguageDefinition[] {
    return [
      ...this.languages.values(),
    ]
      .sort(
        (a, b) =>
          a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0,
      )
      .map(
        (language) => ({
          ...language,
          fileExtensions: [
            ...language.fileExtensions,
          ],
          aliases: [
            ...language.aliases,
          ],
        }),
      );
  }
}

export function createDefaultEngineeringLanguages():
  EngineeringLanguageDefinition[] {
  return [
    {
      id:
        "typescript",
      displayName:
        "TypeScript",
      fileExtensions: [
        ".ts",
        ".tsx",
      ],
      aliases: [
        "ts",
      ],
      enabled:
        true,
    },
    {
      id:
        "javascript",
      displayName:
        "JavaScript",
      fileExtensions: [
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
      ],
      aliases: [
        "js",
      ],
      enabled:
        true,
    },
    {
      id:
        "python",
      displayName:
        "Python",
      fileExtensions: [
        ".py",
      ],
      aliases: [],
      enabled:
        true,
    },
    {
      id:
        "rust",
      displayName:
        "Rust",
      fileExtensions: [
        ".rs",
      ],
      aliases: [
        "rs",
      ],
      enabled:
        true,
    },
    {
      id:
        "go",
      displayName:
        "Go",
      fileExtensions: [
        ".go",
      ],
      aliases: [],
      enabled:
        true,
    },
    {
      id:
        "java",
      displayName:
        "Java",
      fileExtensions: [
        ".java",
      ],
      aliases: [],
      enabled:
        true,
    },
    {
      id:
        "c",
      displayName:
        "C",
      fileExtensions: [
        ".c",
        ".h",
      ],
      aliases: [],
      enabled:
        true,
    },
    {
      id:
        "cpp",
      displayName:
        "C++",
      fileExtensions: [
        ".cpp",
        ".hpp",
      ],
      aliases: [
        "c++",
      ],
      enabled:
        true,
    },
    {
      id:
        "css",
      displayName:
        "CSS",
      fileExtensions: [
        ".css",
      ],
      aliases: [],
      enabled:
        true,
    },
    {
      id:
        "html",
      displayName:
        "HTML",
      fileExtensions: [
        ".html",
        ".htm",
      ],
      aliases: [
        "htm",
      ],
      enabled:
        true,
    },
    {
      id:
        "sql",
      displayName:
        "SQL",
      fileExtensions: [
        ".sql",
      ],
      aliases: [],
      enabled:
        true,
    },
    {
      id:
        "shell",
      displayName:
        "Shell",
      fileExtensions: [
        ".sh",
        ".bash",
      ],
      aliases: [
        "bash",
        "sh",
      ],
      enabled:
        true,
    },
  ];
}
