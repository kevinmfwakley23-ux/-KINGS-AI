import {
  ProjectCapabilityAuditor,
} from "./project-capability-auditor";

import type {
  ProjectEngineeringProfile,
} from "./project-engineering-profile";

import type {
  EngineeringToolchain,
} from "./engineering-toolchain";

import type {
  ToolchainVerificationResult,
} from "./toolchain-verification";

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
  const auditor =
    new ProjectCapabilityAuditor();

  const profile =
    {
      id:
        "profile-tree-0822",
      projectPath:
        "/projects/tree-0822",
      languages: [
        {
          language:
            "typescript",
          fileCount:
            12,
          extensions: [
            ".ts",
            ".tsx",
          ],
        },
        {
          language:
            "python",
          fileCount:
            8,
          extensions: [
            ".py",
          ],
        },
      ],
      verifiedToolchains: [],
      unsupportedLanguages: [],
      requiredOperations: [
        "build",
        "test",
        "run",
      ],
      buildReady:
        true,
      testReady:
        true,
      debugReady:
        true,
    } satisfies ProjectEngineeringProfile;


  const completeVerification =
    [
        {
          language:
            "typescript",
          toolchain: {
            id:
              "toolchain-typescript",
            language:
              "typescript",
            displayName:
              "typescript toolchain",
            fileExtensions:
              [".ts", ".tsx"],
            commands: [],
            enabled:
              true,
          },
          verified:
            true,
          availableExecutables: [
            "typescript",
          ],
          missingExecutables: [],
          unsupportedOperations:
            [],
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
              "python toolchain",
            fileExtensions:
              [".py"],
            commands: [],
            enabled:
              true,
          },
          verified:
            true,
          availableExecutables: [
            "python",
          ],
          missingExecutables: [],
          unsupportedOperations:
            [],
        },
    ] satisfies ToolchainVerificationResult[];


  const ready =
    auditor.audit({
      projectId:
        "project-tree-0822",
      profile,
      verifications:
        completeVerification,
    });

  assert(
    ready.ready,
    "A fully verified project capability set must be ready.",
  );

  assert(
    ready.missingLanguages.length ===
      0,
    "A ready project must have no missing languages.",
  );

  assert(
    ready.missingOperations.length ===
      0,
    "A ready project must have no missing operations.",
  );

  console.log(
    "08.22 complete project capability audit: SUCCESS",
  );

  const incomplete =
    auditor.audit({
      projectId:
        "project-tree-0822-incomplete",
      profile,
      verifications: [
        {
          language:
            "typescript",
          toolchain: {
            id:
              "toolchain-typescript",
            language:
              "typescript",
            displayName:
              "typescript toolchain",
            fileExtensions:
              [".ts", ".tsx"],
            commands: [],
            enabled:
              true,
          },
          verified:
            true,
          availableExecutables: [
            "typescript",
          ],
          missingExecutables: [],
          unsupportedOperations:
            ["run"],
        },
      ] satisfies ToolchainVerificationResult[],
    });

  assert(
    !incomplete.ready,
    "Missing engineering capabilities must block project readiness.",
  );

  assert(
    incomplete.missingLanguages.includes(
      "python",
    ),
    "Missing language capability must be reported.",
  );

  assert(
    incomplete.missingOperations.includes(
      "run",
    ),
    "Missing operation capability must be reported.",
  );

  console.log(
    "08.22 missing-capability detection: SUCCESS",
  );

  const partial =
    auditor.audit({
      projectId:
        "project-tree-0822-partial",
      profile,
      verifications: [
        {
          language:
            "typescript",
          toolchain: {
            id:
              "toolchain-typescript",
            language:
              "typescript",
            displayName:
              "typescript toolchain",
            fileExtensions:
              [".ts", ".tsx"],
            commands: [],
            enabled:
              true,
          },
          verified:
            true,
          availableExecutables: [
            "typescript",
          ],
          missingExecutables: [],
          unsupportedOperations:
            [],
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
              "python toolchain",
            fileExtensions:
              [".py"],
            commands: [],
            enabled:
              true,
          },
          verified:
            false,
          availableExecutables: [
            "python",
          ],
          missingExecutables: [],
          unsupportedOperations:
            ["build"],
        },
      ] satisfies ToolchainVerificationResult[],
    });

  assert(
    !partial.ready,
    "Unverified toolchains must prevent project readiness.",
  );

  assert(
    partial.missingLanguages.includes(
      "python",
    ),
    "Unverified languages must remain missing.",
  );

  console.log(
    "08.22 unverified-toolchain protection: SUCCESS",
  );

  console.log(
    "TREE-08.22 PROJECT CAPABILITY AUDITOR: SUCCESS",
  );
}

main();
