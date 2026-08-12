import {
  EngineeringWorkUnitBridge,
} from "./engineering-work-unit-bridge";

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
  const bridge =
    new EngineeringWorkUnitBridge();

  const readyPlan =
    bridge.createPlan(
      "project-tree-089",
      {
        id:
          "project-tree-089",
        projectPath:
          "/projects/example",
        languages: [
          {
            language:
              "typescript",
            fileCount:
              20,
            extensions: [
              ".ts",
            ],
          },
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
        verifiedToolchains: [],
        unsupportedLanguages: [],
        buildReady:
          true,
        testReady:
          true,
        debugReady:
          true,
      },
    );

  assert(
    !readyPlan.blocked,
    "Fully verified engineering profile must produce an unblocked work plan.",
  );

  assert(
    readyPlan.requirements.length ===
      2,
    "Each detected project language must become an engineering requirement.",
  );

  assert(
    readyPlan.capabilityIds.includes(
      "engineering-typescript",
    ),
    "TypeScript must become an explicit engineering capability requirement.",
  );

  assert(
    readyPlan.capabilityIds.includes(
      "engineering-python",
    ),
    "Python must become an explicit engineering capability requirement.",
  );

  console.log(
    "08.9 multi-language work-unit requirements: SUCCESS",
  );

  console.log(
    "08.9 engineering capability bridge: SUCCESS",
  );

  const blockedPlan =
    bridge.createPlan(
      "project-tree-089-blocked",
      {
        id:
          "project-tree-089-blocked",
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
        verifiedToolchains: [],
        unsupportedLanguages: [
          "python",
        ],
        buildReady:
          false,
        testReady:
          false,
        debugReady:
          false,
      },
    );

  assert(
    blockedPlan.blocked,
    "Unverified engineering profile must block execution.",
  );

  assert(
    blockedPlan.blockReasons.length ===
      3,
    "Blocked engineering work must identify each missing readiness boundary.",
  );

  console.log(
    "08.9 unverified engineering blocking: SUCCESS",
  );

  console.log(
    "TREE-08.9 ENGINEERING WORK UNIT BRIDGE: SUCCESS",
  );
}

main();
