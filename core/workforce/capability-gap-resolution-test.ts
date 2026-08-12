import {
  CapabilityGapResolutionAuthority,
} from "./capability-gap-resolution";

import type {
  ProjectCapabilityAudit,
} from "./project-capability-auditor";

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
    new CapabilityGapResolutionAuthority();

  const audit:
    ProjectCapabilityAudit =
    {
      id:
        "capability-audit-tree-0823",
      projectId:
        "project-tree-0823",
      requiredLanguages: [
        "typescript",
        "python",
      ],
      requiredOperations: [
        "build",
        "test",
        "run",
      ],
      verifiedLanguages: [
        "typescript",
      ],
      missingLanguages: [
        "python",
      ],
      verifiedOperations: [
        "build",
        "test",
      ],
      missingOperations: [
        "run",
      ],
      ready:
        false,
    };

  const plan =
    authority.createPlan(
      audit,
    );

  assert(
    plan.gaps.length ===
      2,
    "Every missing capability must become a resolution gap.",
  );

  assert(
    !plan.ready,
    "A project with unresolved capability gaps must not be ready.",
  );

  console.log(
    "08.23 capability gap plan creation: SUCCESS",
  );

  const languageGap =
    plan.gaps.find(
      (gap) =>
        gap.kind ===
        "language",
    )!;

  expectFailure(
    () =>
      authority.verify(
        plan,
        languageGap.id,
      ),
    "A capability gap must not be verified before resolution.",
  );

  console.log(
    "08.23 pre-verification protection: SUCCESS",
  );

  const resolved =
    authority.resolve(
      plan,
      languageGap.id,
    );

  assert(
    resolved.gaps.some(
      (gap) =>
        gap.id ===
          languageGap.id &&
        gap.resolved,
    ),
    "Resolved capability gaps must persist resolution state.",
  );

  assert(
    !resolved.ready,
    "Resolution alone must not declare the project ready.",
  );

  console.log(
    "08.23 capability resolution state: SUCCESS",
  );

  const verified =
    authority.verify(
      resolved,
      languageGap.id,
    );

  assert(
    verified.gaps.some(
      (gap) =>
        gap.id ===
          languageGap.id &&
        gap.verified,
    ),
    "Verified capability gaps must persist verification state.",
  );

  assert(
    !verified.ready,
    "Other unresolved gaps must continue blocking readiness.",
  );

  console.log(
    "08.23 capability verification state: SUCCESS",
  );

  const operationGap =
    verified.gaps.find(
      (gap) =>
        gap.kind ===
        "operation",
    )!;

  const operationResolved =
    authority.resolve(
      verified,
      operationGap.id,
    );

  const complete =
    authority.verify(
      operationResolved,
      operationGap.id,
    );

  assert(
    complete.ready,
    "All resolved and verified capability gaps must permit readiness.",
  );

  console.log(
    "08.23 complete capability gap closure: SUCCESS",
  );

  expectFailure(
    () =>
      authority.resolve(
        complete,
        operationGap.id,
      ),
    "A verified capability gap must not be resolved twice.",
  );

  console.log(
    "08.23 duplicate resolution protection: SUCCESS",
  );

  console.log(
    "TREE-08.23 CAPABILITY GAP RESOLUTION: SUCCESS",
  );
}

main();
