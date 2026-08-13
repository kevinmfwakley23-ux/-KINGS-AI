import {
  GovernedMemoryStore,
} from "./memory-health-002-enforcement";

function assert(
  condition:
    boolean,

  message:
    string,
):
  void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main():
  Promise<void> {
  const store =
    new GovernedMemoryStore();

  store.write({
    id:
      "working-001",

    content:
      "Current task state.",

    lifecycle: {
      kind:
        "current-task",

      verified:
        false,

      superseded:
        false,
    },

    createdAt:
      "2026-08-13T15:00:00.000Z",
  });

  console.log(
    "001.MEMORY-HEALTH-002 governed working-memory write: SUCCESS",
  );

  store.write({
    id:
      "candidate-001",

    content:
      "Unverified research finding.",

    lifecycle: {
      kind:
        "fact",

      verified:
        false,

      superseded:
        false,
    },

    createdAt:
      "2026-08-13T15:01:00.000Z",
  });

  const candidate =
    store.get(
      "candidate-001",
    );

  assert(
    candidate !==
      undefined,

    "Candidate memory must be stored.",
  );

  assert(
    candidate!.lifecycle.authority ===
      "candidate",

    "Unverified memory must remain candidate memory.",
  );

  assert(
    candidate!.lifecycle.requiresVerification ===
      true,

    "Candidate memory must retain its verification requirement.",
  );

  console.log(
    "002.MEMORY-HEALTH-002 unverified memory remains protected candidate: SUCCESS",
  );

  store.write({
    id:
      "verified-001",

    content:
      "Verified engineering knowledge.",

    lifecycle: {
      kind:
        "verified-knowledge",

      verified:
        true,

      superseded:
        false,
    },

    createdAt:
      "2026-08-13T15:02:00.000Z",
  });

  const authoritative =
    store.get(
      "verified-001",
    );

  assert(
    authoritative!.lifecycle.authority ===
      "authoritative",

    "Verified knowledge must enter authoritative memory.",
  );

  assert(
    store.retrieveAuthoritative().length ===
      1,

    "Only authoritative knowledge must be returned by authoritative retrieval.",
  );

  console.log(
    "003.MEMORY-HEALTH-002 verified knowledge reaches authoritative retrieval: SUCCESS",
  );

  store.write({
    id:
      "archive-001",

    content:
      "Historical project record.",

    lifecycle: {
      kind:
        "historical-record",

      verified:
        true,

      superseded:
        false,
    },

    createdAt:
      "2026-08-13T15:03:00.000Z",
  });

  const activeAfterArchive =
    store.retrieveActive(
      20,
    );

  assert(
    !activeAfterArchive.some(
      (
        record,
      ) =>
        record.id ===
        "archive-001",
    ),

    "Archival memory must not enter active retrieval.",
  );

  console.log(
    "004.MEMORY-HEALTH-002 archival memory excluded from active context: SUCCESS",
  );

  store.write({
    id:
      "superseded-001",

    content:
      "Previously accepted guidance.",

    lifecycle: {
      kind:
        "fact",

      verified:
        true,

      superseded:
        false,
    },

    createdAt:
      "2026-08-13T15:04:00.000Z",
  });

  const superseded =
    store.promote({
      id:
        "superseded-001",

      verified:
        true,

      superseded:
        true,

      updatedAt:
        "2026-08-13T15:05:00.000Z",
    });

  assert(
    superseded.lifecycle.lifecycleClass ===
      "superseded",

    "Supersession must change the lifecycle classification.",
  );

  assert(
    superseded.lifecycle.durable ===
      true,

    "Superseded memory must remain durable.",
  );

  assert(
    !store.retrieveActive(
      20,
    ).some(
      (
        record,
      ) =>
        record.id ===
        "superseded-001",
    ),

    "Superseded memory must be excluded from active retrieval.",
  );

  console.log(
    "005.MEMORY-HEALTH-002 superseded memory removed from active context: SUCCESS",
  );

  let rejected =
    false;

  try {
    store.write({
      id:
        "invalid-authoritative-001",

      content:
        "This must not become authoritative.",

      lifecycle: {
        kind:
          "verified-knowledge",

        verified:
          false,

        superseded:
          false,
      },

      createdAt:
        "2026-08-13T15:06:00.000Z",
    });
  } catch {
    rejected =
      true;
  }

  assert(
    rejected,

    "Unverified verified-knowledge must be rejected at the write boundary.",
  );

  assert(
    store.get(
      "invalid-authoritative-001",
    ) ===
      undefined,

    "Rejected authoritative memory must not be stored.",
  );

  console.log(
    "006.MEMORY-HEALTH-002 write-boundary verification enforcement: SUCCESS",
  );

  const active =
    store.retrieveActive(
      20,
    );

  assert(
    active.some(
      (
        record,
      ) =>
        record.id ===
        "working-001",
    ),

    "Working memory must remain retrievable in active context.",
  );

  assert(
    active.some(
      (
        record,
      ) =>
        record.id ===
        "candidate-001",
    ),

    "Candidate semantic memory may remain retrievable while clearly marked as candidate.",
  );

  assert(
    active.some(
      (
        record,
      ) =>
        record.id ===
        "verified-001",
    ),

    "Authoritative memory must remain retrievable in active context.",
  );

  assert(
    active.length ===
      3,

    "Active retrieval must exclude archival and superseded records.",
  );

  console.log(
    "007.MEMORY-HEALTH-002 active-context admission enforcement: SUCCESS",
  );

  console.log(
    "MEMORY-HEALTH-002 MEMORY WRITE → PROMOTION → RETRIEVAL GOVERNANCE: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    throw error;
  },
);
