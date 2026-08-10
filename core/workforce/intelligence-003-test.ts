import type {
  MemoryReference,
} from "./types";

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

function now(): string {
  return new Date().toISOString();
}

function main(): void {
  const store =
    new MemoryStore();

  const workingMemory:
    MemoryReference = {
    id: "memory-intelligence-003-working",
    type: "working",
    summary:
      "Temporary implementation observation.",
    sourceReferences: [
      "task-intelligence-003",
    ],
    taskId:
      "task-intelligence-003",
    authoritative: false,
    createdAt: now(),
    updatedAt: now(),
  };

  const semanticMemory:
    MemoryReference = {
    id: "memory-intelligence-003-semantic",
    type: "semantic",
    summary:
      "K.I.N.G.S. requires provenance before durable memory promotion.",
    sourceReferences: [
      "architecture-memory-rule",
    ],
    missionId:
      "mission-intelligence",
    authoritative: false,
    createdAt: now(),
    updatedAt: now(),
  };

  store.register(
    workingMemory,
  );

  store.register(
    semanticMemory,
  );

  assert(
    store.get(
      workingMemory.id,
    ) !== undefined,
    "Registered working memory should be retrievable.",
  );

  assert(
    store.query({
      type: "semantic",
    }).length === 1,
    "Typed memory query should isolate semantic memory.",
  );

  const gate =
    new MemoryPromotionGate();

  const rejected =
    gate.evaluate({
      memory: {
        ...semanticMemory,
        sourceReferences: [],
      },
      verificationReferences: [],
      humanAccepted: false,
    });

  assert(
    !rejected.allowed,
    "Unproven memory must not be promoted.",
  );

  assert(
    rejected.reasons.length > 0,
    "Rejected promotion must provide reasons.",
  );

  console.log(
    "Typed memory registration: SUCCESS",
  );

  console.log(
    "Typed memory filtering: SUCCESS",
  );

  console.log(
    "Unproven memory rejection: SUCCESS",
  );

  const verificationDecision =
    gate.evaluate({
      memory:
        semanticMemory,
      verificationReferences: [
        "intelligence-003-regression",
      ],
      humanAccepted: false,
    });

  assert(
    verificationDecision.allowed,
    "Verified memory should be eligible for promotion.",
  );

  const promoted =
    store.promote(
      semanticMemory.id,
    );

  assert(
    promoted.authoritative,
    "Promoted memory should become authoritative.",
  );

  assert(
    store.query({
      authoritativeOnly: true,
    }).some(
      (memory) =>
        memory.id ===
        semanticMemory.id,
    ),
    "Authoritative memory query should return promoted memory.",
  );

  console.log(
    "Verified memory promotion: SUCCESS",
  );

  const humanAcceptedDecision =
    gate.evaluate({
      memory:
        workingMemory,
      verificationReferences: [],
      humanAccepted: true,
    });

  assert(
    humanAcceptedDecision.allowed,
    "Explicit human acceptance should permit promotion.",
  );

  console.log(
    "Human acceptance promotion path: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-003 typed memory and promotion authority: SUCCESS",
  );
}

main();
