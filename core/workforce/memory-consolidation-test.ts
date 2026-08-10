import {
  MemoryConsolidationAuthority,
} from "./memory-consolidation";

import type {
  MemoryReference,
} from "./types";

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

const now =
  new Date().toISOString();

const memories:
  MemoryReference[] = [
    {
      id:
        "memory-013-a",
      type:
        "episodic",
      summary:
        "Mission execution confirmed context retrieval works.",
      sourceReferences: [
        "test-013-a",
      ],
      missionId:
        "mission-013",
      authoritative:
        false,
      createdAt:
        now,
      updatedAt:
        now,
    },
    {
      id:
        "memory-013-b",
      type:
        "episodic",
      summary:
        "Mission execution confirmed context optimization works.",
      sourceReferences: [
        "test-013-b",
      ],
      missionId:
        "mission-013",
      authoritative:
        false,
      createdAt:
        now,
      updatedAt:
        now,
    },
    {
      id:
        "memory-013-c",
      type:
        "episodic",
      summary:
        "Mission execution confirmed relevant memory reaches the agent.",
      sourceReferences: [
        "test-013-c",
      ],
      missionId:
        "mission-013",
      authoritative:
        false,
      createdAt:
        now,
      updatedAt:
        now,
    },
  ];

const authority =
  new MemoryConsolidationAuthority();

const decision =
  authority.propose({
    memories,
    candidateId:
      "memory-013-consolidated",
    memoryType:
      "semantic",
    summary:
      "Mission execution context retrieval, optimization, and delivery to agents are verified.",
    consolidationReason:
      "Consolidate three related execution observations into one durable candidate.",
    missionId:
      "mission-013",
  });

assert(
  decision.allowed,
  "Valid consolidation should be allowed.",
);

assert(
  decision.candidate.authoritative ===
    false,
  "Consolidation candidates must never become authoritative automatically.",
);

console.log(
  "Consolidation candidate creation: SUCCESS",
);

assert(
  decision.candidate.sourceCount === 3,
  "All source memories must be preserved.",
);

assert(
  decision.candidate.sourceMemoryIds.length ===
    3,
  "Source memory ids must be retained.",
);

console.log(
  "Source memory lineage preservation: SUCCESS",
);

assert(
  decision.candidate.sourceReferences.length ===
    3,
  "All unique provenance references must be preserved.",
);

console.log(
  "Provenance preservation: SUCCESS",
);

assert(
  decision.candidate.estimatedInputCharacters >
    0,
  "Input size must be measured.",
);

assert(
  decision.candidate.estimatedOutputCharacters >
    0,
  "Output size must be measured.",
);

console.log(
  "Consolidation size accounting: SUCCESS",
);

assert(
  decision.candidate.estimatedCharacterSavings >=
    0,
  "Estimated savings cannot be negative.",
);

console.log(
  "Token-saving proxy calculation: SUCCESS",
);

const invalid =
  authority.propose({
    memories: [],
    candidateId:
      "",
    memoryType:
      "semantic",
    summary:
      "",
    consolidationReason:
      "",
  });

assert(
  !invalid.allowed,
  "Invalid consolidation must be rejected.",
);

assert(
  invalid.reasons.length >= 4,
  "Invalid consolidation must explain its rejection.",
);

console.log(
  "Invalid consolidation rejection: SUCCESS",
);

const duplicate =
  authority.propose({
    memories: [
      memories[0],
      memories[0],
    ],
    candidateId:
      "memory-013-duplicate",
    memoryType:
      "semantic",
    summary:
      "Duplicate source test.",
    consolidationReason:
      "Testing duplicate protection.",
  });

assert(
  !duplicate.allowed,
  "Duplicate source memories must be rejected.",
);

console.log(
  "Duplicate source protection: SUCCESS",
);

const missingProvenance =
  authority.propose({
    memories: [
      {
        ...memories[0],
        sourceReferences: [],
      },
    ],
    candidateId:
      "memory-013-no-provenance",
    memoryType:
      "semantic",
    summary:
      "Missing provenance test.",
    consolidationReason:
      "Testing provenance protection.",
  });

assert(
  !missingProvenance.allowed,
  "Missing provenance must be rejected.",
);

console.log(
  "Missing provenance rejection: SUCCESS",
);

console.log(
  "INTELLIGENCE-013 memory consolidation authority: SUCCESS",
);
