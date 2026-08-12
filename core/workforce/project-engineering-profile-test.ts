import {
  ProjectEngineeringProfileAuthority,
} from "./project-engineering-profile";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function main(): void {
  const authority =
    new ProjectEngineeringProfileAuthority();

  const profile =
    authority.build({
      id:
        "project-tree-088",
      projectPath:
        "/projects/example",
      languages: [
        {
          language:
            "typescript",
          fileCount:
            42,
          extensions: [
            ".ts",
            ".tsx",
          ],
        },
        {
          language:
            "python",
          fileCount:
            12,
          extensions: [
            ".py",
          ],
        },
      ],
      requiredOperations: [
        "build",
        "test",
        "run",
      ],
      toolchainResults: [
        {
          language:
            "typescript",
          toolchain: {
            id:
              "toolchain-typescript",
            language:
              "typescript",
            displayName:
              "TypeScript",
            fileExtensions: [
              ".ts",
              ".tsx",
            ],
            commands: [],
            enabled:
              true,
          },
          verified:
            true,
          availableExecutables: [
            "npx",
            "npm",
          ],
          missingExecutables: [],
          unsupportedOperations: [],
        },
        {
          language:
            "python",
          toolchain: {
            id:
              "toolchain-python",
            language:
              "python",
            displayName:
              "Python",
            fileExtensions: [
              ".py",
            ],
            commands: [],
            enabled:
              true,
          },
          verified:
            true,
          availableExecutables: [
            "python3",
          ],
          missingExecutables: [],
          unsupportedOperations: [],
        },
      ],
    });

  assert(
    profile.languages.length ===
      2,
    "Project profile must preserve all detected languages.",
  );

  assert(
    profile.buildReady,
    "Project with verified build toolchains must be build-ready.",
  );

  assert(
    profile.testReady,
    "Project with verified test toolchains must be test-ready.",
  );

  assert(
    profile.debugReady,
    "Project with verified runtime toolchains must be runtime/debug-ready.",
  );

  assert(
    profile.unsupportedLanguages.length ===
      0,
    "Fully verified project must have no unsupported languages.",
  );

  console.log(
    "08.8 multi-language project profiling: SUCCESS",
  );

  console.log(
    "08.8 verified engineering readiness: SUCCESS",
  );

  console.log(
    "08.8 build/test/runtime readiness: SUCCESS",
  );

  const incomplete =
    authority.build({
      id:
        "project-tree-088-incomplete",
      projectPath:
        "/projects/incomplete",
      languages: [
        {
          language:
            "python",
          fileCount:
            10,
          extensions: [
            ".py",
          ],
        },
      ],
      requiredOperations: [
        "build",
        "test",
        "run",
      ],
      toolchainResults: [
        {
          language:
            "python",
          toolchain: {
            id:
              "toolchain-python",
            language:
              "python",
            displayName:
              "Python",
            fileExtensions: [
              ".py",
            ],
            commands: [],
            enabled:
              true,
          },
          verified:
            false,
          availableExecutables: [
            "python3",
          ],
          missingExecutables: [
            "pytest",
          ],
          unsupportedOperations: [],
        },
      ],
    });

  assert(
    !incomplete.buildReady,
    "Incomplete toolchain must prevent build readiness.",
  );

  assert(
    !incomplete.testReady,
    "Incomplete toolchain must prevent test readiness.",
  );

  assert(
    !incomplete.debugReady,
    "Incomplete toolchain must prevent runtime readiness.",
  );

  assert(
    incomplete.unsupportedLanguages.includes(
      "python",
    ),
    "Incomplete language toolchain must be surfaced explicitly.",
  );

  console.log(
    "08.8 incomplete toolchain rejection: SUCCESS",
  );

  console.log(
    "TREE-08.8 PROJECT ENGINEERING PROFILE: SUCCESS",
  );
}

main();
