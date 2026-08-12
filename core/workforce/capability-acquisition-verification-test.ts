import {
  CapabilityAcquisitionVerificationAuthority,
} from "./capability-acquisition-verification";

import type {
  CapabilityGapResolutionPlan,
} from "./capability-gap-resolution";

import type {
  CapabilityAcquisitionExecution,
} from "./capability-acquisition-execution";

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
    new CapabilityAcquisitionVerificationAuthority();

  const plan:
    CapabilityGapResolutionPlan =
    {
      id:
        "gap-plan-tree-0826",
      projectId:
        "project-tree-0826",
      gaps: [
        {
          id:
            "gap-python-tree-0826",
          projectId:
            "project-tree-0826",
          kind:
            "language",
          language:
            "python",
          resolved:
            true,
          verified:
            false,
        },
      ],
      ready:
        false,
    };

  const execution:
    CapabilityAcquisitionExecution =
    {
      id:
        "acquisition-execution-gap-python-tree-0826",
      actionId:
        "acquisition-gap-python-tree-0826",
      projectId:
        "project-tree-0826",
      status:
        "succeeded",
      startedAt:
        "2026-08-12T14:00:00Z",
      completedAt:
        "2026-08-12T14:02:00Z",
      evidence:
        "Python executable probe and governed test execution succeeded.",
    };

  const verification:
    ToolchainVerificationResult =
    {
      language:
        "python",
      toolchain: {
        id:
          "toolchain-python",
        language:
          "python",
        displayName:
          "Python toolchain",
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
        "python",
      ],
      missingExecutables: [],
      unsupportedOperations: [],
    };

  const result =
    authority.verify(
      plan,
      execution,
      verification,
    );

  assert(
    result.verified,
    "Successful acquisition must require successful independent toolchain verification.",
  );

  console.log(
    "08.26 acquisition-to-verification bridge: SUCCESS",
  );

  const applied =
    authority.apply(
      plan,
      result,
    );

  assert(
    applied.gaps[0].verified,
    "Verified acquisition capability must update the capability gap.",
  );

  assert(
    applied.ready,
    "A fully verified capability plan must become ready.",
  );

  console.log(
    "08.26 verified capability state update: SUCCESS",
  );

  const failedExecution:
    CapabilityAcquisitionExecution =
    {
      ...execution,
      id:
        "acquisition-execution-failed",
      status:
        "failed",
      evidence:
        undefined,
    };

  expectFailure(
    () =>
      authority.verify(
        plan,
        failedExecution,
        verification,
      ),
    "Failed acquisition execution must never enter verification.",
  );

  console.log(
    "08.26 failed acquisition verification protection: SUCCESS",
  );

  const unsupported:
    ToolchainVerificationResult =
    {
      ...verification,
      verified:
        false,
      unsupportedOperations: [
        "run",
      ],
    };

  const operationPlan:
    CapabilityGapResolutionPlan =
    {
      id:
        "gap-plan-operation-tree-0826",
      projectId:
        "project-tree-0826",
      gaps: [
        {
          id:
            "gap-run-tree-0826",
          projectId:
            "project-tree-0826",
          kind:
            "operation",
          operation:
            "run",
          resolved:
            true,
          verified:
            false,
        },
      ],
      ready:
        false,
    };

  expectFailure(
    () =>
      authority.verify(
        operationPlan,
        execution,
        unsupported,
      ),
    "Unsupported required operations must remain blocked.",
  );

  console.log(
    "08.26 unsupported capability protection: SUCCESS",
  );

  console.log(
    "TREE-08.26 ACQUISITION VERIFICATION BRIDGE: SUCCESS",
  );
}

main();
