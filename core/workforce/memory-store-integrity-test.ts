import type {
  MemoryReference,
} from "./types";

import {
  MemoryStore,
} from "./memory-store";

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

function createMemory(
  id: string,
  authoritative = false,
): MemoryReference {
  return {
    id,
    type:
      "semantic",
    summary:
      `Memory ${id}`,
    sourceReferences: [
      `SOURCE-${id}`,
    ],
    missionId:
      "MISSION-05-5",
    authoritative,
    createdAt:
      "2026-08-12T13:00:00.000Z",
    updatedAt:
      "2026-08-12T13:00:00.000Z",
  };
}

function main(): void {
  const store =
    new MemoryStore();

  store.register(
    createMemory(
      "MEMORY-B",
    ),
  );

  store.register(
    createMemory(
      "MEMORY-A",
      true,
    ),
  );

  store.register(
    createMemory(
      "MEMORY-C",
    ),
  );

  console.log(
    "05.5.1 memory registration: SUCCESS",
  );

  const listed =
    store.list();

  assert(
    listed.map(
      (memory) => memory.id,
    ).join(",") ===
      "MEMORY-A,MEMORY-B,MEMORY-C",
    "Memory listing was not deterministically ordered.",
  );

  console.log(
    "05.5.1 deterministic memory listing: SUCCESS",
  );

  const filtered =
    store.query({
      missionId:
        "MISSION-05-5",
    });

  assert(
    filtered.length === 3,
    "Mission memory filtering failed.",
  );

  console.log(
    "05.5.1 mission filtering: SUCCESS",
  );

  const authoritative =
    store.query({
      authoritativeOnly:
        true,
    });

  assert(
    authoritative.length === 1 &&
      authoritative[0].id ===
        "MEMORY-A",
    "Authoritative memory filtering failed.",
  );

  console.log(
    "05.5.1 authoritative boundary: SUCCESS",
  );

  const zero =
    store.query({
      limit: 0,
    });

  assert(
    zero.length === 0,
    "Explicit zero memory limit was not respected.",
  );

  console.log(
    "05.5.1 explicit zero-limit safety: SUCCESS",
  );

  const limited =
    store.query({
      limit: 2,
    });

  assert(
    limited.length === 2 &&
      limited[0].id ===
        "MEMORY-A" &&
      limited[1].id ===
        "MEMORY-B",
    "Memory query limit was not deterministic.",
  );

  console.log(
    "05.5.1 deterministic result limiting: SUCCESS",
  );

  let invalidLimitRejected =
    false;

  try {
    store.query({
      limit: -1,
    });
  } catch (error) {
    invalidLimitRejected =
      error instanceof Error &&
      error.message.includes(
        "limit must be a non-negative integer",
      );
  }

  assert(
    invalidLimitRejected,
    "Negative memory limit was not rejected.",
  );

  console.log(
    "05.5.1 invalid-limit rejection: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    store.register(
      createMemory(
        "MEMORY-A",
      ),
    );
  } catch (error) {
    duplicateRejected =
      error instanceof Error &&
      error.message.includes(
        "duplicate memory id",
      );
  }

  assert(
    duplicateRejected,
    "Duplicate memory registration was not rejected.",
  );

  console.log(
    "05.5.1 duplicate protection: SUCCESS",
  );

  const original =
    store.get(
      "MEMORY-A",
    )!;

  original.sourceReferences.push(
    "MUTATION",
  );

  const reread =
    store.get(
      "MEMORY-A",
    )!;

  assert(
    !reread.sourceReferences.includes(
      "MUTATION",
    ),
    "Memory provenance was exposed as mutable internal state.",
  );

  console.log(
    "05.5.1 provenance isolation: SUCCESS",
  );

  const queried =
    store.query({
      missionId:
        "MISSION-05-5",
      limit: 3,
    });

  queried[0].sourceReferences.push(
    "QUERY-MUTATION",
  );

  const rereadAfterQuery =
    store.get(
      queried[0].id,
    )!;

  assert(
    !rereadAfterQuery.sourceReferences.includes(
      "QUERY-MUTATION",
    ),
    "Query results exposed mutable internal provenance.",
  );

  console.log(
    "05.5.1 query result isolation: SUCCESS",
  );

  const repeatedA =
    store.query({
      missionId:
        "MISSION-05-5",
      limit: 3,
    });

  const repeatedB =
    store.query({
      missionId:
        "MISSION-05-5",
      limit: 3,
    });

  assert(
    JSON.stringify(
      repeatedA,
    ) ===
      JSON.stringify(
        repeatedB,
      ),
    "Repeated memory queries were not deterministic.",
  );

  console.log(
    "05.5.1 repeated-query determinism: SUCCESS",
  );

  store.clear();

  assert(
    store.list().length === 0,
    "Memory store clear did not remove all memories.",
  );

  console.log(
    "05.5.1 memory store clear integrity: SUCCESS",
  );

  console.log(
    "TREE-05.5.1 MEMORY STORE INTEGRITY: SUCCESS",
  );
}

main();
