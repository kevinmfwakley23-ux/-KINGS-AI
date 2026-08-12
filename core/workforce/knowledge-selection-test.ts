import type {
  Evidence,
  KnowledgeRecord,
  KnowledgeSource,
  Task,
} from "./types";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

import {
  KnowledgeRetrieval,
} from "./knowledge-retrieval";

import {
  KnowledgeSelectionAuthority,
} from "./knowledge-selection";

function now(): string {
  return new Date().toISOString();
}

const timestamp = now();

const authoritativeSource: KnowledgeSource = {
  id: "source-selection-authoritative",
  type: "construction-document",
  name: "K.I.N.G.S. Authoritative Architecture",
  description:
    "Authoritative project architecture for knowledge selection testing.",
  location:
    "~/KINGS-AI/test/authoritative-architecture.md",
  authoritative: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const secondarySource: KnowledgeSource = {
  id: "source-selection-secondary",
  type: "construction-document",
  name: "Secondary Research",
  description:
    "Non-authoritative research source.",
  location:
    "~/KINGS-AI/test/secondary-research.md",
  authoritative: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const authoritativeEvidence: Evidence = {
  id: "evidence-selection-authoritative",
  sourceId:
    authoritativeSource.id,
  description:
    "Authoritative evidence for the requested architecture.",
  location:
    "architecture / selection",
  createdAt: timestamp,
};

const secondaryEvidence: Evidence = {
  id: "evidence-selection-secondary",
  sourceId:
    secondarySource.id,
  description:
    "Secondary evidence that must not enter authoritative selection.",
  location:
    "research / secondary",
  createdAt: timestamp,
};

const registry =
  new KnowledgeRegistry();

registry.registerSource(
  authoritativeSource,
);

registry.registerSource(
  secondarySource,
);

registry.registerEvidence(
  authoritativeEvidence,
);

registry.registerEvidence(
  secondaryEvidence,
);

const relevantAuthoritative:
  KnowledgeRecord = {
    id:
      "knowledge-selection-authoritative",
    sourceId:
      authoritativeSource.id,
    memoryType:
      "semantic",
    summary:
      "Context builder selects authoritative project architecture for execution.",
    evidenceIds: [
      authoritativeEvidence.id,
    ],
    authoritative: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

const irrelevantAuthoritative:
  KnowledgeRecord = {
    id:
      "knowledge-selection-irrelevant",
    sourceId:
      authoritativeSource.id,
    memoryType:
      "procedural",
    summary:
      "Marketplace payment processing is unrelated to execution architecture.",
    evidenceIds: [],
    authoritative: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

const relevantNonAuthoritative:
  KnowledgeRecord = {
    id:
      "knowledge-selection-secondary",
    sourceId:
      secondarySource.id,
    memoryType:
      "semantic",
    summary:
      "Context builder execution architecture from secondary research.",
    evidenceIds: [
      secondaryEvidence.id,
    ],
    authoritative: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

registry.registerRecord(
  relevantAuthoritative,
);

registry.registerRecord(
  irrelevantAuthoritative,
);

registry.registerRecord(
  relevantNonAuthoritative,
);

const retrieval =
  new KnowledgeRetrieval(
    registry,
  );

const authority =
  new KnowledgeSelectionAuthority(
    retrieval,
    {
      maxRecords: 5,
      maxEvidence: 5,
    },
  );

const task: Task = {
  id:
    "TASK-KNOWLEDGE-SELECTION",
  missionId:
    "MISSION-KNOWLEDGE-SELECTION",
  name:
    "Build execution context",
  description:
    "Select authoritative project architecture required for execution context.",
  requiredCapabilities: [],
  requiredToolIds: [],
  status:
    "ready",
  dependencyIds: [],
  inputReferences: [],
  expectedOutputs: [
    "execution context",
  ],
  knowledgeQuery: {
    query:
      "context builder execution architecture",
    authoritativeOnly: false,
    limit: 10,
  },
  createdAt:
    timestamp,
  updatedAt:
    timestamp,
};

const decision =
  authority.select(task);

if (!decision.selected) {
  throw new Error(
    "Knowledge selection failed to select relevant knowledge.",
  );
}

if (!decision.result) {
  throw new Error(
    "Knowledge selection did not return a result.",
  );
}

if (
  decision.result.records.length !== 1
) {
  throw new Error(
    `Expected exactly one selected authoritative record, got ${decision.result.records.length}`,
  );
}

if (
  decision.result.records[0].id !==
  relevantAuthoritative.id
) {
  throw new Error(
    "Knowledge selection returned the wrong record.",
  );
}

console.log(
  "03.3 task-scoped knowledge selection: SUCCESS",
);

if (
  decision.result.records.some(
    (record) =>
      !record.authoritative,
  )
) {
  throw new Error(
    "Knowledge selection allowed non-authoritative knowledge.",
  );
}

console.log(
  "03.3 authoritative knowledge boundary: SUCCESS",
);

if (
  decision.result.records.some(
    (record) =>
      record.id ===
      irrelevantAuthoritative.id,
  )
) {
  throw new Error(
    "Knowledge selection retained unrelated authoritative knowledge.",
  );
}

console.log(
  "03.3 irrelevant knowledge exclusion: SUCCESS",
);

if (
  decision.result.evidence.length !==
  1
) {
  throw new Error(
    "Knowledge selection failed to preserve only relevant evidence.",
  );
}

if (
  decision.result.evidence[0].id !==
  authoritativeEvidence.id
) {
  throw new Error(
    "Knowledge selection returned incorrect evidence.",
  );
}

console.log(
  "03.3 evidence selection: SUCCESS",
);

if (
  decision.result.sourceIds.length !==
  1 ||
  decision.result.sourceIds[0] !==
    authoritativeSource.id
) {
  throw new Error(
    "Knowledge selection failed to preserve source provenance.",
  );
}

console.log(
  "03.3 source provenance preservation: SUCCESS",
);

const limitedTask: Task = {
  ...task,
  id:
    "TASK-KNOWLEDGE-SELECTION-LIMIT",
  knowledgeQuery: {
    ...task.knowledgeQuery!,
    query:
      "context builder",
    limit: 1,
  },
};

const limitedDecision =
  authority.select(
    limitedTask,
  );

if (
  !limitedDecision.result ||
  limitedDecision.result.records.length >
    1
) {
  throw new Error(
    "Knowledge selection limit was not enforced.",
  );
}

console.log(
  "03.3 knowledge selection budget: SUCCESS",
);

const noKnowledgeTask: Task = {
  ...task,
  id:
    "TASK-NO-KNOWLEDGE",
  knowledgeQuery:
    undefined,
};

const noKnowledgeDecision =
  authority.select(
    noKnowledgeTask,
  );

if (
  noKnowledgeDecision.selected ||
  noKnowledgeDecision.result
) {
  throw new Error(
    "Knowledge-free task unexpectedly received knowledge.",
  );
}

console.log(
  "03.3 knowledge-free task preservation: SUCCESS",
);

const emptyQueryTask: Task = {
  ...task,
  id:
    "TASK-EMPTY-KNOWLEDGE-QUERY",
  knowledgeQuery: {
    query: "   ",
    authoritativeOnly: true,
    limit: 5,
  },
};

let emptyQueryRejected =
  false;

try {
  authority.select(
    emptyQueryTask,
  );
} catch {
  emptyQueryRejected =
    true;
}

if (!emptyQueryRejected) {
  throw new Error(
    "Empty knowledge query was not rejected.",
  );
}

console.log(
  "03.3 invalid knowledge query rejection: SUCCESS",
);

const secondaryOnlyTask: Task = {
  ...task,
  id:
    "TASK-SECONDARY-ONLY",
  knowledgeQuery: {
    query:
      "context builder execution architecture",
    sourceIds: [
      secondarySource.id,
    ],
    authoritativeOnly: false,
    limit: 5,
  },
};

const secondaryDecision =
  authority.select(
    secondaryOnlyTask,
  );

if (
  secondaryDecision.selected ||
  secondaryDecision.result?.records.length
) {
  throw new Error(
    "Non-authoritative source bypassed the authoritative selection boundary.",
  );
}

console.log(
  "03.3 non-authoritative source rejection: SUCCESS",
);

console.log(
  "TREE-03.3 KNOWLEDGE SELECTION: SUCCESS",
);
