import {
  MemoryAuthority,
} from "./memory-authority";

import {
  MemoryPromotionGate,
} from "./memory-promotion-gate";

import {
  MemoryStore,
} from "./memory-store";

import {
  MemoryConsolidationAuthority,
} from "./memory-consolidation";

import {
  MemoryConsolidationStore,
} from "./memory-consolidation-store";

import {
  MemoryConsolidationAuthorityBridge,
} from "./memory-consolidation-authority";

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
  "2026-08-12T16:30:00.000Z";

const sourceA:
  MemoryReference = {
  id:
    "MEMORY-05-5-7-A",
  type:
    "episodic",
  summary:
    "Verified execution observation A.",
  sourceReferences: [
    "SOURCE-05-5-7-A",
  ],
  missionId:
    "MISSION-05-5-7",
  authoritative:
    false,
  createdAt:
    now,
  updatedAt:
    now,
};

const sourceB:
  MemoryReference = {
  id:
    "MEMORY-05-5-7-B",
  type:
    "episodic",
  summary:
    "Verified execution observation B.",
  sourceReferences: [
    "SOURCE-05-5-7-B",
  ],
  missionId:
    "MISSION-05-5-7",
  authoritative:
    false,
  createdAt:
    now,
  updatedAt:
    now,
};

const consolidationAuthority =
  new MemoryConsolidationAuthority();

const candidate =
  consolidationAuthority.propose({
    memories: [
      sourceA,
      sourceB,
    ],
    candidateId:
      "MEMORY-05-5-7-CONSOLIDATED",
    memoryType:
      "semantic",
    summary:
      "Verified execution observations consolidated into durable mission context.",
    consolidationReason:
      "Reduce duplicate durable memory while preserving lineage and provenance.",
    missionId:
      "MISSION-05-5-7",
  });

assert(
  candidate.allowed,
  "Valid consolidation candidate was not accepted.",
);

console.log(
  "05.5.7 consolidation candidate preparation: SUCCESS",
);

const consolidationStore =
  new MemoryConsolidationStore();

consolidationStore.register(
  candidate.candidate,
);

const memoryStore =
  new MemoryStore();

const memoryAuthority =
  new MemoryAuthority(
    memoryStore,
    new MemoryPromotionGate(),
  );

const bridge =
  new MemoryConsolidationAuthorityBridge(
    consolidationStore,
    memoryAuthority,
  );

console.log(
  "05.5.7 consolidation authority bridge construction: SUCCESS",
);

const unverified =
  bridge.promote({
    candidateId:
      candidate.candidate.id,
    verificationReferences: [],
    humanAccepted:
      false,
  });

assert(
  !unverified.allowed,
  "Unverified consolidation candidate bypassed authority.",
);

assert(
  unverified.reasons.some(
    (reason) =>
      reason.includes(
        "verification evidence or explicit human acceptance",
      ),
  ),
  "Unverified consolidation rejection reason was not preserved.",
);

console.log(
  "05.5.7 unverified consolidation rejection: SUCCESS",
);

const verified =
  bridge.promote({
    candidateId:
      candidate.candidate.id,
    verificationReferences: [
      "VERIFICATION-05-5-7",
    ],
    humanAccepted:
      false,
  });

assert(
  verified.allowed,
  "Verified consolidation candidate was not promoted.",
);

assert(
  verified.memory?.authoritative ===
    true,
  "Promoted consolidated memory did not become authoritative.",
);

console.log(
  "05.5.7 verified consolidation promotion: SUCCESS",
);

assert(
  verified.memory !== undefined &&
  verified.memory.sourceReferences.includes(
    "SOURCE-05-5-7-A",
  ) &&
  verified.memory.sourceReferences.includes(
    "SOURCE-05-5-7-B",
  ),
  "Consolidated memory lost source provenance.",
);

console.log(
  "05.5.7 consolidated provenance preservation: SUCCESS",
);

const persisted =
  memoryAuthority.get(
    candidate.candidate.id,
  );

assert(
  persisted?.authoritative ===
    true,
  "Promoted consolidated memory was not durably authoritative.",
);

console.log(
  "05.5.7 durable consolidated authority: SUCCESS",
);

const retrieved =
  memoryAuthority.query({
    authoritativeOnly:
      true,
  });

assert(
  retrieved.some(
    (memory) =>
      memory.id ===
      candidate.candidate.id,
  ),
  "Authoritative consolidated memory was not retrievable.",
);

console.log(
  "05.5.7 authoritative retrieval boundary: SUCCESS",
);

const isolated =
  memoryAuthority.get(
    candidate.candidate.id,
  );

isolated!.sourceReferences.push(
  "MUTATION-ATTEMPT",
);

const reread =
  memoryAuthority.get(
    candidate.candidate.id,
  );

assert(
  !reread!.sourceReferences.includes(
    "MUTATION-ATTEMPT",
  ),
  "Promoted consolidated provenance was not defensively isolated.",
);

console.log(
  "05.5.7 promoted provenance isolation: SUCCESS",
);

const duplicate =
  bridge.promote({
    candidateId:
      candidate.candidate.id,
    verificationReferences: [
      "VERIFICATION-05-5-7",
    ],
    humanAccepted:
      true,
  });

assert(
  !duplicate.allowed,
  "Existing authoritative memory was promoted a second time.",
);

console.log(
  "05.5.7 duplicate authority protection: SUCCESS",
);

const missing =
  bridge.promote({
    candidateId:
      "CANDIDATE-DOES-NOT-EXIST",
    verificationReferences: [
      "VERIFICATION-05-5-7",
    ],
    humanAccepted:
      false,
  });

assert(
  !missing.allowed,
  "Unknown consolidation candidate was accepted.",
);

console.log(
  "05.5.7 unknown candidate rejection: SUCCESS",
);

const secondCandidate =
  consolidationAuthority.propose({
    memories: [
      sourceA,
    ],
    candidateId:
      "MEMORY-05-5-7-HUMAN",
    memoryType:
      "semantic",
    summary:
      "Human-approved consolidated mission context.",
    consolidationReason:
      "Preserve a verified human-approved durable result.",
    missionId:
      "MISSION-05-5-7",
  });

consolidationStore.register(
  secondCandidate.candidate,
);

const human =
  bridge.promote({
    candidateId:
      secondCandidate.candidate.id,
    verificationReferences: [],
    humanAccepted:
      true,
  });

assert(
  human.allowed &&
  human.memory?.authoritative ===
    true,
  "Explicit human acceptance did not authorize consolidation promotion.",
);

console.log(
  "05.5.7 human acceptance promotion: SUCCESS",
);

console.log(
  "TREE-05.5.7 MEMORY CONSOLIDATION AUTHORITY: SUCCESS",
);
