import {
  WorkforceRuntimeBindingRegistry,
} from "./runtime-binding-registry";

import {
  createDefaultKnowledgeRuntimeAdapter,
} from "../../runtimes/knowledge-runtime/adapter";

import {
  RepositorySourceInspectionAdapter,
} from "../../runtimes/source-inspection/repository-adapter";

const registry =
  new WorkforceRuntimeBindingRegistry();

const knowledgeAdapter =
  createDefaultKnowledgeRuntimeAdapter();

const sourceInspectionAdapter =
  new RepositorySourceInspectionAdapter();

registry.register(
  {
    id: "knowledge-runtime",
    name: "K.I.N.G.S. Knowledge Runtime",
    type: "knowledge",
    description:
      "Provides authoritative project knowledge retrieval.",
    enabled: true,
  },
  knowledgeAdapter,
);

registry.register(
  {
    id: "source-inspection-runtime",
    name: "K.I.N.G.S. Source Inspection Runtime",
    type: "source",
    description:
      "Inspects authorized project source content.",
    enabled: true,
  },
  sourceInspectionAdapter,
);

const knowledgeBinding =
  registry.get(
    "knowledge-runtime",
  );

if (!knowledgeBinding) {
  throw new Error(
    "RUNTIME-003 failed: knowledge runtime binding was not found.",
  );
}

if (
  knowledgeBinding.implementation !==
  knowledgeAdapter
) {
  throw new Error(
    "RUNTIME-003 failed: knowledge adapter identity mismatch.",
  );
}

if (
  typeof (
    knowledgeBinding.implementation as {
      retrieve?: unknown;
    }
  ).retrieve !==
  "function"
) {
  throw new Error(
    "RUNTIME-003 failed: knowledge runtime does not expose retrieve().",
  );
}

console.log(
  "Real knowledge runtime binding: SUCCESS",
);

const sourceBinding =
  registry.get(
    "source-inspection-runtime",
  );

if (!sourceBinding) {
  throw new Error(
    "RUNTIME-003 failed: source inspection runtime binding was not found.",
  );
}

if (
  sourceBinding.implementation !==
  sourceInspectionAdapter
) {
  throw new Error(
    "RUNTIME-003 failed: source inspection adapter identity mismatch.",
  );
}

if (
  typeof (
    sourceBinding.implementation as {
      inspect?: unknown;
    }
  ).inspect !==
  "function"
) {
  throw new Error(
    "RUNTIME-003 failed: source inspection runtime does not expose inspect().",
  );
}

console.log(
  "Real source inspection runtime binding: SUCCESS",
);

if (
  registry.list().length !== 2
) {
  throw new Error(
    "RUNTIME-003 failed: expected exactly two real runtime bindings.",
  );
}

console.log(
  "Real runtime binding registry: SUCCESS",
);

console.log(
  "RUNTIME-003 real runtime bindings: SUCCESS",
);
