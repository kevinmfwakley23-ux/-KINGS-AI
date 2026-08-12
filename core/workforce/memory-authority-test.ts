import type {
  MemoryReference,
} from "./types";

import {
  MemoryAuthority,
} from "./memory-authority";

import {
  MemoryStore,
} from "./memory-store";

import {
  MemoryPromotionGate,
} from "./memory-promotion-gate";

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
): MemoryReference {
  return {
    id,
    type:
      "semantic",
    summary:
      `Durable memory ${id}`,
    sourceReferences: [
      `SOURCE-${id}`,
    ],
    missionId:
      "MISSION-05-5",
    authoritative:
      false,
    createdAt:
      "2026-08-12T14:00:00.000Z",
    updatedAt:
      "2026-08-12T14:00:00.000Z",
  };
}

function main(): void {
  const store =
    new MemoryStore();

  const gate =
    new MemoryPromotionGate();

  const authority =
    new MemoryAuthority(
      store,
      gate,
    );

  console.log(
    "05.5.2 memory authority construction: SUCCESS",
  );

  const memory =
    authority.register(
      createMemory(
        "MEMORY-AUTHORITY-001",
      ),
    );

  assert(
    memory.id ===
      "MEMORY-AUTHORITY-001" &&
      memory.authoritative ===
        false,
    "Memory authority registration failed.",
  );

  console.log(
    "05.5.2 controlled memory registration: SUCCESS",
  );

  const rejected =
    authority.evaluatePromotion({
      memoryId:
        memory.id,
      verificationReferences: [],
      humanAccepted:
        false,
    });

  assert(
    rejected.allowed ===
      false &&
      rejected.reasons.some(
        (reason) =>
          reason.includes(
            "verification evidence or explicit human acceptance",
          ),
      ),
    "Unverified durable memory was not rejected.",
  );

  console.log(
    "05.5.2 unverified promotion rejection: SUCCESS",
  );

  const verified =
    authority.evaluatePromotion({
      memoryId:
        memory.id,
      verificationReferences: [
        "VERIFICATION-05-5-001",
      ],
      humanAccepted:
        false,
    });

  assert(
    verified.allowed ===
      true &&
      verified.reasons.length ===
        0,
    "Verified memory was not accepted by the promotion gate.",
  );

  console.log(
    "05.5.2 verification promotion eligibility: SUCCESS",
  );

  const promoted =
    authority.promote({
      memoryId:
        memory.id,
      verificationReferences: [
        "VERIFICATION-05-5-001",
      ],
      humanAccepted:
        false,
    });

  assert(
    promoted.decision.allowed ===
      true &&
      promoted.memory?.authoritative ===
        true,
    "Verified memory was not promoted.",
  );

  console.log(
    "05.5.2 verified memory promotion: SUCCESS",
  );

  const reread =
    authority.get(
      memory.id,
    );

  assert(
    reread?.authoritative ===
      true,
    "Promoted memory was not durably authoritative.",
  );

  console.log(
    "05.5.2 durable authority persistence: SUCCESS",
  );

  const humanMemory =
    authority.register(
      createMemory(
        "MEMORY-AUTHORITY-002",
      ),
    );

  const human =
    authority.promote({
      memoryId:
        humanMemory.id,
      verificationReferences: [],
      humanAccepted:
        true,
    });

  assert(
    human.decision.allowed ===
      true &&
      human.memory?.authoritative ===
        true,
    "Explicit human acceptance did not authorize promotion.",
  );

  console.log(
    "05.5.2 human acceptance promotion: SUCCESS",
  );

  const badMemory:
    MemoryReference = {
    ...createMemory(
      "MEMORY-AUTHORITY-003",
    ),
    sourceReferences: [],
  };

  authority.register(
    badMemory,
  );

  const bad =
    authority.evaluatePromotion({
      memoryId:
        badMemory.id,
      verificationReferences: [
        "VERIFICATION-05-5-002",
      ],
      humanAccepted:
        false,
    });

  assert(
    bad.allowed ===
      false &&
      bad.reasons.some(
        (reason) =>
          reason.includes(
            "provenance",
          ),
      ),
    "Memory without provenance was allowed through promotion.",
  );

  console.log(
    "05.5.2 provenance promotion boundary: SUCCESS",
  );

  let missingRejected =
    false;

  try {
    authority.evaluatePromotion({
      memoryId:
        "MEMORY-DOES-NOT-EXIST",
      verificationReferences: [
        "VERIFICATION-05-5-003",
      ],
      humanAccepted:
        false,
    });
  } catch (error) {
    missingRejected =
      error instanceof Error &&
      error.message.includes(
        "not found",
      );
  }

  assert(
    missingRejected,
    "Unknown memory promotion was not rejected.",
  );

  console.log(
    "05.5.2 unknown memory rejection: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    authority.register(
      createMemory(
        "MEMORY-AUTHORITY-001",
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
    "Duplicate durable memory was not rejected.",
  );

  console.log(
    "05.5.2 duplicate protection: SUCCESS",
  );

  const authoritative =
    authority.query({
      authoritativeOnly:
        true,
    });

  assert(
    authoritative.length ===
      2 &&
      authoritative.every(
        (item) =>
          item.authoritative ===
          true,
      ),
    "Authoritative memory query crossed the promotion boundary.",
  );

  console.log(
    "05.5.2 authoritative retrieval boundary: SUCCESS",
  );

  const zero =
    authority.query({
      limit: 0,
    });

  assert(
    zero.length ===
      0,
    "Memory authority did not preserve zero-limit safety.",
  );

  console.log(
    "05.5.2 zero-limit safety: SUCCESS",
  );

  const first =
    authority.query({
      missionId:
        "MISSION-05-5",
    });

  const second =
    authority.query({
      missionId:
        "MISSION-05-5",
    });

  assert(
    JSON.stringify(
      first,
    ) ===
      JSON.stringify(
        second,
      ),
    "Memory authority retrieval was not deterministic.",
  );

  console.log(
    "05.5.2 repeated-query determinism: SUCCESS",
  );

  console.log(
    "TREE-05.5.2 MEMORY AUTHORITY: SUCCESS",
  );
}

main();
