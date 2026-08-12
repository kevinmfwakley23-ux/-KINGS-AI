import {
  CapabilityClosureBridge,
} from "./capability-closure-bridge";

import type {
  ProjectCapabilityAuditRequest,
  ProjectCapabilityAudit,
} from "./project-capability-auditor";

import type {
  CapabilityGapResolutionPlan,
} from "./capability-gap-resolution";

import type {
  CapabilityVerificationBridgeResult,
} from "./capability-acquisition-verification";

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
  const bridge =
    new CapabilityClosureBridge();

  const request:
    ProjectCapabilityAuditRequest =
    {
      projectId:
        "project-tree-0827",
      profile: {
        id:
          "profile-tree-0827",
        projectPath:
          "/projects/tree-0827",
        languages: [
          {
            language:
              "python",
            fileCount:
              4,
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
      },
      verifications: [],
    };

  const plan:
    CapabilityGapResolutionPlan =
    {
      id:
        "gap-plan-tree-0827",
      projectId:
        "project-tree-0827",
      gaps: [
        {
          id:
            "gap-python-tree-0827",
          projectId:
            "project-tree-0827",
          kind:
            "language",
          language:
            "python",
          resolved:
            true,
          verified:
            true,
        },
      ],
      ready:
        true,
    };

  const verification:
    CapabilityVerificationBridgeResult =
    {
      id:
        "capability-verification-gap-python-tree-0827",
      projectId:
        "project-tree-0827",
      gapId:
        "gap-python-tree-0827",
      language:
        "python",
      acquisitionExecutionId:
        "acquisition-execution-gap-python-tree-0827",
      verified:
        true,
      evidence:
        "Python runtime independently verified.",
    };

  const audit:
    ProjectCapabilityAudit =
    {
      id:
        "capability-audit-tree-0827",
      projectId:
        "project-tree-0827",
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

  const result =
    bridge.close(
      request,
      plan,
      verification,
      audit,
      "2026-08-12T14:30:00Z",
    );

  assert(
    result.closure.closed,
    "Verified capability closure must persist closed state.",
  );

  assert(
    result.ready,
    "A successfully re-audited project must be ready.",
  );

  console.log(
    "08.27 verified capability closure: SUCCESS",
  );

  const incompleteAudit:
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
      bridge.close(
        request,
        plan,
        verification,
        incompleteAudit,
        "2026-08-12T14:31:00Z",
      ),
    "A project with remaining capability gaps must not close as ready.",
  );

  console.log(
    "08.27 incomplete capability protection: SUCCESS",
  );

  const wrongProjectRequest:
    ProjectCapabilityAuditRequest =
    {
      ...request,
      projectId:
        "wrong-project",
    };

  expectFailure(
    () =>
      bridge.close(
        wrongProjectRequest,
        plan,
        verification,
        audit,
        "2026-08-12T14:32:00Z",
      ),
    "Capability closure must enforce project identity.",
  );

  console.log(
    "08.27 project identity enforcement: SUCCESS",
  );

  const unverifiedPlan:
    CapabilityGapResolutionPlan =
    {
      ...plan,
      ready:
        false,
      gaps: [
        {
          ...plan.gaps[0],
          verified:
            false,
        },
      ],
    };

  expectFailure(
    () =>
      bridge.close(
        request,
        unverifiedPlan,
        verification,
        audit,
        "2026-08-12T14:33:00Z",
      ),
    "Unverified capability gaps must not close.",
  );

  console.log(
    "08.27 durable verification enforcement: SUCCESS",
  );

  console.log(
    "TREE-08.27 CAPABILITY CLOSURE BRIDGE: SUCCESS",
  );
}

main();
