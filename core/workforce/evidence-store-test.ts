import type {
  CompletionEvidence,
} from "./completion-gate";

import {
  EvidenceStore,
} from "./evidence-store";

function now(): string {
  return new Date().toISOString();
}

function evidence(
  id: string,
  type: string,
  criterion: string,
  status: "passed" | "failed" = "passed",
): CompletionEvidence {
  return {
    id,
    type,
    criterion,
    status,
    summary:
      `Verification evidence for ${criterion}.`,
    verificationReference:
      `verification/${id}`,
    createdAt: now(),
  };
}

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function main(): void {
  const store =
    new EvidenceStore();

  const typecheck =
    evidence(
      "evidence-006-typecheck",
      "typecheck",
      "TypeScript compilation passes",
    );

  const test =
    evidence(
      "evidence-006-test",
      "test",
      "Regression tests pass",
    );

  const failed =
    evidence(
      "evidence-006-failed",
      "verification",
      "Independent verification fails",
      "failed",
    );

  store.register(
    typecheck,
  );

  store.register(
    test,
  );

  store.register(
    failed,
  );

  assert(
    store.has(typecheck.id),
    "Registered evidence should be discoverable.",
  );

  assert(
    store.get(typecheck.id)?.id ===
      typecheck.id,
    "Evidence lookup should return the registered item.",
  );

  assert(
    store.list().length === 3,
    "Evidence store should retain all registered evidence.",
  );

  assert(
    store.query({
      type: "test",
    }).length === 1,
    "Evidence type filtering should work.",
  );

  assert(
    store.query({
      status: "passed",
    }).length === 2,
    "Evidence status filtering should work.",
  );

  assert(
    store.query({
      verificationReference:
        "verification/evidence-006-test",
    }).length === 1,
    "Verification provenance filtering should work.",
  );

  try {
    store.register(
      typecheck,
    );

    throw new Error(
      "Duplicate evidence was unexpectedly accepted.",
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message.includes(
        'duplicate evidence id "evidence-006-typecheck"',
      )
    ) {
      throw error;
    }
  }

  const retrieved =
    store.get(
      typecheck.id,
    );

  if (!retrieved) {
    throw new Error(
      "Expected evidence was not retrieved.",
    );
  }

  retrieved.summary =
    "MUTATED OUTSIDE STORE";

  const unchanged =
    store.get(
      typecheck.id,
    );

  assert(
    unchanged?.summary !==
      "MUTATED OUTSIDE STORE",
    "Evidence store must protect stored evidence from external mutation.",
  );

  try {
    store.register({
      ...typecheck,
      id: "evidence-006-no-reference",
      verificationReference: "",
    });

    throw new Error(
      "Evidence without verification provenance was unexpectedly accepted.",
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message.includes(
        "requires a verification reference",
      )
    ) {
      throw error;
    }
  }

  console.log(
    "Evidence registration: SUCCESS",
  );
  console.log(
    "Evidence lookup: SUCCESS",
  );
  console.log(
    "Evidence filtering: SUCCESS",
  );
  console.log(
    "Verification provenance: SUCCESS",
  );
  console.log(
    "Duplicate evidence rejection: SUCCESS",
  );
  console.log(
    "Evidence mutation protection: SUCCESS",
  );
  console.log(
    "Missing verification provenance rejection: SUCCESS",
  );
  console.log(
    "INTELLIGENCE-006 evidence store boundary: SUCCESS",
  );
}

main();
