import type {
  ID,
} from "./types";

import {
  EngineeringLanguageRegistry,
  createDefaultEngineeringLanguages,
} from "./engineering-language";

import {
  EngineeringToolchainRegistry,
  createDefaultEngineeringToolchains,
  type EngineeringLanguage,
  type ToolchainOperation,
} from "./engineering-toolchain";

import {
  LocalProjectLanguageDetector,
  type ProjectDevelopmentEnvironment,
} from "./project-language-detector";

import {
  LocalToolchainProbeAuthority,
} from "./local-toolchain-probe";

import {
  ToolchainVerificationAuthority,
  type ToolchainVerificationResult,
} from "./toolchain-verification";

import {
  ProjectEngineeringProfileAuthority,
  type ProjectEngineeringProfile,
  type ProjectLanguageEvidence,
} from "./project-engineering-profile";

import {
  EngineeringWorkUnitBridge,
  type EngineeringWorkUnitPlan,
} from "./engineering-work-unit-bridge";

import {
  AutonomousEngineeringExecutionAuthority,
  type AutonomousEngineeringExecution,
} from "./autonomous-engineering-execution";

export interface LocalProjectEngineeringReadinessRequest {
  id: ID;
  projectPath: string;
  requiredOperations: ToolchainOperation[];
  executionId?: ID;
}

export interface LocalProjectEngineeringReadinessResult {
  environment: ProjectDevelopmentEnvironment;
  executionLanguages: ProjectLanguageEvidence[];
  verifications: ToolchainVerificationResult[];
  profile: ProjectEngineeringProfile;
  plan: EngineeringWorkUnitPlan;
  execution: AutonomousEngineeringExecution;
  blockedReasons: string[];
}

/**
 * Turns a real local repository into governed engineering readiness evidence.
 *
 * Detection and probing are non-destructive. This authority does not install
 * dependencies, execute project build/test scripts, edit source, or infer that
 * an unrelated executable is equivalent to the project's declared package
 * manager. It prepares the truthful boundary that later execution may consume.
 */
export class LocalProjectEngineeringReadinessAuthority {
  private readonly detector: LocalProjectLanguageDetector;
  private readonly probe: LocalToolchainProbeAuthority;
  private readonly verifier: ToolchainVerificationAuthority;
  private readonly profiles = new ProjectEngineeringProfileAuthority();
  private readonly workUnits = new EngineeringWorkUnitBridge();
  private readonly executions = new AutonomousEngineeringExecutionAuthority();

  constructor(
    private readonly languages: EngineeringLanguageRegistry =
      createLanguageRegistry(),
    private readonly toolchains: EngineeringToolchainRegistry =
      createToolchainRegistry(),
  ) {
    this.detector = new LocalProjectLanguageDetector(this.languages);
    this.probe = new LocalToolchainProbeAuthority(this.toolchains);
    this.verifier = new ToolchainVerificationAuthority(this.toolchains);
  }

  async inspect(
    request: LocalProjectEngineeringReadinessRequest,
  ): Promise<LocalProjectEngineeringReadinessResult> {
    if (!request.id.trim()) {
      throw new Error(
        "K.I.N.G.S. Local Project Readiness: project id is required",
      );
    }

    if (!request.projectPath.trim()) {
      throw new Error(
        "K.I.N.G.S. Local Project Readiness: project path is required",
      );
    }

    const requiredOperations = uniqueOperations(
      request.requiredOperations,
    );

    if (!requiredOperations.length) {
      throw new Error(
        "K.I.N.G.S. Local Project Readiness: at least one engineering operation is required",
      );
    }

    const environment = await this.detector.detect(
      request.projectPath,
    );

    const executionLanguages = selectExecutionLanguages(
      environment,
    );

    if (!executionLanguages.length) {
      throw new Error(
        "K.I.N.G.S. Local Project Readiness: no registered source language could be selected as a project execution driver",
      );
    }

    const blockedReasons: string[] = [];
    const verifications: ToolchainVerificationResult[] = [];

    for (const language of executionLanguages) {
      const toolchain = this.toolchains.get(language.language);
      if (!toolchain) {
        blockedReasons.push(
          `No verified engineering toolchain is registered for detected execution language "${language.language}".`,
        );
        continue;
      }

      const packageMismatch = packageManagerMismatchReason(
        language.language,
        environment,
        toolchain.commands.map((command) => command.command),
      );

      if (packageMismatch) {
        blockedReasons.push(packageMismatch);
        continue;
      }

      const probes = this.probe.probe({
        language: language.language,
        requiredOperations,
        workingDirectory: request.projectPath,
      });

      const verification = this.verifier.verify({
        language: language.language,
        requiredOperations,
        probes,
      });

      verifications.push(verification);

      if (!verification.verified) {
        blockedReasons.push(
          verificationFailureReason(verification),
        );
      }
    }

    const profile = this.profiles.build({
      id: request.id,
      projectPath: request.projectPath,
      languages: executionLanguages,
      requiredOperations,
      toolchainResults: verifications,
    });

    for (const language of profile.unsupportedLanguages) {
      const reason = `Execution language "${language}" does not have complete verified local toolchain evidence.`;
      if (!blockedReasons.includes(reason)) {
        blockedReasons.push(reason);
      }
    }

    const plan = this.workUnits.createPlan(
      request.id,
      profile,
    );

    const execution = this.executions.plan({
      id: request.executionId ?? `engineering-execution-${request.id}`,
      projectId: request.id,
      profile,
      plan: blockedReasons.length
        ? {
          ...plan,
          blocked: true,
          blockReasons: uniqueStrings([
            ...plan.blockReasons,
            ...blockedReasons,
          ]),
        }
        : plan,
    });

    return {
      environment,
      executionLanguages,
      verifications,
      profile,
      plan: execution.status === "blocked"
        ? {
          ...plan,
          blocked: true,
          blockReasons: [...execution.blockedReasons],
        }
        : plan,
      execution,
      blockedReasons: [...execution.blockedReasons],
    };
  }
}

export function selectExecutionLanguages(
  environment: ProjectDevelopmentEnvironment,
): ProjectLanguageEvidence[] {
  const primary = environment.primaryLanguage;

  return environment.languages.filter((evidence) => {
    if (evidence.language === primary) return true;
    return hasIndependentProjectDriver(
      evidence.language,
      environment.manifestFiles,
    );
  });
}

function hasIndependentProjectDriver(
  language: EngineeringLanguage,
  manifests: string[],
): boolean {
  const names = new Set(
    manifests.map((path) => path.split("/").at(-1) ?? path),
  );

  switch (language) {
    case "typescript":
      return names.has("tsconfig.json");
    case "javascript":
      return hasAny(names, [
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lock",
        "bun.lockb",
      ]);
    case "python":
      return hasAny(names, [
        "requirements.txt",
        "uv.lock",
        "poetry.lock",
        "pyproject.toml",
      ]);
    case "rust":
      return names.has("Cargo.toml");
    case "go":
      return names.has("go.mod");
    case "java":
      return hasAny(names, [
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
      ]);
    case "c":
    case "cpp":
      return names.has("CMakeLists.txt") ||
        names.has("Makefile");
    default:
      return false;
  }
}

function packageManagerMismatchReason(
  language: EngineeringLanguage,
  environment: ProjectDevelopmentEnvironment,
  executables: string[],
): string | undefined {
  if (
    language !== "typescript" &&
    language !== "javascript"
  ) {
    return undefined;
  }

  const detected = environment.packageManagers.filter(
    (manager) =>
      ["npm", "pnpm", "yarn", "bun"].includes(manager),
  );

  if (!detected.length) return undefined;

  const usesNpmTooling =
    executables.includes("npm") ||
    executables.includes("npx");

  if (
    usesNpmTooling &&
    !detected.includes("npm")
  ) {
    return `Detected JavaScript package manager ${detected.join(", ")} does not match the registered npm/npx toolchain. K.I.N.G.S. will not substitute npm implicitly.`;
  }

  return undefined;
}

function verificationFailureReason(
  result: ToolchainVerificationResult,
): string {
  const details: string[] = [];

  if (result.unsupportedOperations.length) {
    details.push(
      `unsupported operations: ${result.unsupportedOperations.join(", ")}`,
    );
  }

  if (result.missingExecutables.length) {
    details.push(
      `missing executables: ${result.missingExecutables.join(", ")}`,
    );
  }

  if (result.missingCapabilities?.length) {
    details.push(
      `missing capabilities: ${result.missingCapabilities.join(", ")}`,
    );
  }

  return `Toolchain verification failed for "${result.language}"${details.length ? ` (${details.join("; ")})` : ""}.`;
}

function uniqueOperations(
  operations: ToolchainOperation[],
): ToolchainOperation[] {
  return [...new Set(operations)];
}

function uniqueStrings(
  values: string[],
): string[] {
  return [...new Set(values)];
}

function hasAny(
  values: Set<string>,
  candidates: string[],
): boolean {
  return candidates.some((candidate) => values.has(candidate));
}

function createLanguageRegistry(): EngineeringLanguageRegistry {
  const registry = new EngineeringLanguageRegistry();
  for (const language of createDefaultEngineeringLanguages()) {
    registry.register(language);
  }
  return registry;
}

function createToolchainRegistry(): EngineeringToolchainRegistry {
  const registry = new EngineeringToolchainRegistry();
  for (const toolchain of createDefaultEngineeringToolchains()) {
    registry.register(toolchain);
  }
  return registry;
}
