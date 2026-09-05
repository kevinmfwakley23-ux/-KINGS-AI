import {
  readdir,
} from "node:fs/promises";

import {
  basename,
  extname,
  join,
  relative,
} from "node:path";

import type {
  EngineeringLanguageDefinition,
  EngineeringLanguageRegistry,
} from "./engineering-language";

import type {
  ProjectLanguageEvidence,
} from "./project-engineering-profile";

export interface ProjectDevelopmentEnvironment {
  projectPath: string;
  scannedFileCount: number;
  languages: ProjectLanguageEvidence[];
  primaryLanguage?: string;
  packageManagers: string[];
  buildSystems: string[];
  manifestFiles: string[];
}

export interface ProjectLanguageDetectorOptions {
  maxFiles?: number;
  ignoredDirectories?: string[];
}

interface ProjectMarker {
  matches(path: string): boolean;
  packageManagers?: string[];
  buildSystems?: string[];
}

const DEFAULT_IGNORED_DIRECTORIES = [
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "venv",
];

const MARKERS: ProjectMarker[] = [
  exactMarker("package-lock.json", ["npm"]),
  exactMarker("pnpm-lock.yaml", ["pnpm"]),
  exactMarker("yarn.lock", ["yarn"]),
  exactMarker("bun.lock", ["bun"]),
  exactMarker("bun.lockb", ["bun"]),
  exactMarker("requirements.txt", ["pip"]),
  exactMarker("uv.lock", ["uv"]),
  exactMarker("poetry.lock", ["poetry"]),
  exactMarker("Cargo.toml", ["cargo"], ["cargo"]),
  exactMarker("go.mod", ["go-modules"], ["go"]),
  exactMarker("pom.xml", ["maven"], ["maven"]),
  exactMarker("build.gradle", ["gradle"], ["gradle"]),
  exactMarker("build.gradle.kts", ["gradle"], ["gradle"]),
  exactMarker("CMakeLists.txt", undefined, ["cmake"]),
  exactMarker("Makefile", undefined, ["make"]),
  exactMarker("tsconfig.json", undefined, ["typescript"]),
  extensionMarker(".csproj", ["nuget"], ["dotnet"]),
  extensionMarker(".sln", ["nuget"], ["dotnet"]),
  exactMarker("Package.swift", ["swiftpm"], ["swiftpm"]),
  exactMarker("pubspec.yaml", ["dart-pub"], ["dart"]),
];

export class LocalProjectLanguageDetector {
  private readonly maxFiles: number;
  private readonly ignoredDirectories: Set<string>;

  constructor(
    private readonly languages: EngineeringLanguageRegistry,
    options: ProjectLanguageDetectorOptions = {},
  ) {
    this.maxFiles = options.maxFiles ?? 50_000;
    this.ignoredDirectories = new Set([
      ...DEFAULT_IGNORED_DIRECTORIES,
      ...(options.ignoredDirectories ?? []),
    ]);
  }

  async detect(
    projectPath: string,
  ): Promise<ProjectDevelopmentEnvironment> {
    if (!projectPath.trim()) {
      throw new Error(
        "K.I.N.G.S. Project Language Detector: project path is required",
      );
    }

    const files: string[] = [];
    await this.walk(projectPath, projectPath, files);

    const languageCounts = new Map<
      string,
      {
        definition: EngineeringLanguageDefinition;
        count: number;
        extensions: Set<string>;
      }
    >();

    const packageManagers = new Set<string>();
    const buildSystems = new Set<string>();
    const manifestFiles = new Set<string>();

    for (const file of files) {
      const extension = extname(file).toLowerCase();
      const language = extension
        ? this.languages.detectByExtension(extension)
        : undefined;

      if (language) {
        const current = languageCounts.get(language.id) ?? {
          definition: language,
          count: 0,
          extensions: new Set<string>(),
        };
        current.count += 1;
        current.extensions.add(extension);
        languageCounts.set(language.id, current);
      }

      for (const marker of MARKERS) {
        if (!marker.matches(file)) continue;
        manifestFiles.add(file);
        for (const manager of marker.packageManagers ?? []) {
          packageManagers.add(manager);
        }
        for (const buildSystem of marker.buildSystems ?? []) {
          buildSystems.add(buildSystem);
        }
      }
    }

    const detectedLanguages: ProjectLanguageEvidence[] = [
      ...languageCounts.values(),
    ]
      .map((entry) => ({
        language: entry.definition.id,
        fileCount: entry.count,
        extensions: [...entry.extensions].sort(),
      }))
      .sort((left, right) =>
        right.fileCount - left.fileCount ||
        left.language.localeCompare(right.language),
      );

    return {
      projectPath,
      scannedFileCount: files.length,
      languages: detectedLanguages,
      primaryLanguage: detectedLanguages[0]?.language,
      packageManagers: [...packageManagers].sort(),
      buildSystems: [...buildSystems].sort(),
      manifestFiles: [...manifestFiles].sort(),
    };
  }

  private async walk(
    projectRoot: string,
    directory: string,
    files: string[],
  ): Promise<void> {
    const entries = await readdir(directory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (files.length >= this.maxFiles) {
        throw new Error(
          `K.I.N.G.S. Project Language Detector: file limit ${this.maxFiles} exceeded`,
        );
      }

      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && this.ignoredDirectories.has(entry.name)) {
        continue;
      }

      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.walk(projectRoot, absolute, files);
        continue;
      }

      if (!entry.isFile()) continue;
      files.push(normalizeRelative(relative(projectRoot, absolute)));
    }
  }
}

function exactMarker(
  name: string,
  packageManagers?: string[],
  buildSystems?: string[],
): ProjectMarker {
  return {
    matches(path) {
      return basename(path) === name;
    },
    packageManagers,
    buildSystems,
  };
}

function extensionMarker(
  extension: string,
  packageManagers?: string[],
  buildSystems?: string[],
): ProjectMarker {
  return {
    matches(path) {
      return extname(path).toLowerCase() === extension.toLowerCase();
    },
    packageManagers,
    buildSystems,
  };
}

function normalizeRelative(path: string): string {
  return path.replaceAll("\\", "/");
}
