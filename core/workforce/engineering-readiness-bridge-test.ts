import {
  EngineeringReadinessAuthority,
} from "./engineering-readiness-bridge";

import type {
  ProjectCapabilityAudit,
} from "./project-capability-auditor";

import type {
  CapabilityClosureResult,
} from "./capability-closure-bridge";

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

function expectFailure(
  action:
    () => void,
  message:
    string,
): void {
  let failed =
    false;

  try {
    action();
  } catch {
    failed =
      true;
  }

  assert(
    failed,
    message,
  );
}

function main(): void {
  const authority =
    new EngineeringReadinessAuthority();

  const audit:
    ProjectCapabilityAudit =
    {
      id:
        "capability-audit-tree-0828",
      projectId:
        "project-tree-0828",
      requiredLanguages: [
        "python",
      ],
      requiredOperations: [
        "build",
        "test",
        "run",
      ],
      verifiedLanguages: [
        "python",
      ],
      missingLanguages: [],
      verifiedOperations: [
        "build",
        "test",
        "run",
      ],
      missingOperations: [],
      ready:
        true,
    };

  const closure:
    CapabilityClosureResult =
    {
      audit,
      closure: {
        id:
          "capability-closure-gap-tree-0828",
        projectId:
          "project-tree-0828",
        gapId:
          "gap-python-tree-0828",
        verificationId:
          "capability-verification-gap-python-tree-0828",
        closed:
          true,
        closedAt:
          "2026-08-12T14:40:00Z",
      },
      ready:
        true,
    };

  const result =
    authority.establish(
      audit,
      closure,
      "2026-08-12T14:41:00Z",
    );

  assert(
    result.readiness.ready,
    "A verified capability closure must establish engineering readiness.",
  );

  assert(
    result.readiness.projectId ===
      "project-tree-0828",
    "Engineering readiness must preserve project identity.",
  );

  console.log(
    "08.28 verified engineering readiness: SUCCESS",
  );

  const unreadyAudit:
    ProjectCapabilityAudit =
    {
      ...audit,
      ready:
        false,
      missingOperations: [
        "run",
      ],
    };

  expectFailure(
    () =>
      authority.establish(
        unreadyAudit,
        closure,
        "2026-08-12T14:42:00Z",
      ),
    "An unready project must not enter engineering-ready state.",
  );

  console.log(
    "08.28 incomplete capability protection: SUCCESS",
  );

  const openClosure:
    CapabilityClosureResult =
    {
      ...closure,
      ready:
        false,
      closure: {
        ...closure.closure,
        closed:
          false,
      },
    };

  expectFailure(
    () =>
      authority.establish(
        audit,
        openClosure,
        "2026-08-12T14:43:00Z",
      ),
    "An open capability closure must not establish engineering readiness.",
  );

  console.log(
    "08.28 closure verification protection: SUCCESS",
  );

  const wrongProjectClosure:
    CapabilityClosureResult =
    {
      ...closure,
      closure: {
        ...closure.closure,
        projectId:
          "wrong-project",
      },
    };

  expectFailure(
    () =>
      authority.establish(
        audit,
        wrongProjectClosure,
        "2026-08-12T14:44:00Z",
      ),
    "Engineering readiness must enforce project identity.",
  );

  console.log(
    "08.28 project identity enforcement: SUCCESS",
  );

  console.log(
    "TREE-08.28 ENGINEERING READINESS BRIDGE: SUCCESS",
  );
}

main();
