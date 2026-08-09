import {
  WorkforceRuntimeBindingRegistry,
} from "./runtime-binding-registry";

const registry =
  new WorkforceRuntimeBindingRegistry();

const knowledgeImplementation = {
  id: "knowledge-adapter-test",
};

const sourceImplementation = {
  id: "source-adapter-test",
};

registry.register(
  {
    id: "knowledge-runtime",
    name: "K.I.N.G.S. Knowledge Runtime",
    type: "knowledge",
    description:
      "Provides authoritative project knowledge retrieval.",
    enabled: true,
  },
  knowledgeImplementation,
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
  sourceImplementation,
);

const knowledge =
  registry.get(
    "knowledge-runtime",
  );

if (!knowledge) {
  throw new Error(
    "Runtime binding test failed: knowledge runtime was not found.",
  );
}

if (
  knowledge.definition.type !==
  "knowledge"
) {
  throw new Error(
    "Runtime binding test failed: knowledge runtime type mismatch.",
  );
}

if (
  knowledge.implementation !==
  knowledgeImplementation
) {
  throw new Error(
    "Runtime binding test failed: knowledge implementation mismatch.",
  );
}

const source =
  registry.get(
    "source-inspection-runtime",
  );

if (!source) {
  throw new Error(
    "Runtime binding test failed: source runtime was not found.",
  );
}

if (
  source.definition.type !==
  "source"
) {
  throw new Error(
    "Runtime binding test failed: source runtime type mismatch.",
  );
}

if (
  source.implementation !==
  sourceImplementation
) {
  throw new Error(
    "Runtime binding test failed: source implementation mismatch.",
  );
}

if (
  registry.list().length !== 2
) {
  throw new Error(
    "Runtime binding test failed: expected two bindings.",
  );
}

try {
  registry.register(
    {
      id: "knowledge-runtime",
      name: "Duplicate",
      type: "knowledge",
      description:
        "Intentional duplicate binding test.",
      enabled: true,
    },
    {},
  );

  throw new Error(
    "Runtime binding test failed: duplicate binding was allowed.",
  );
} catch (error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  if (
    !message.includes(
      'runtime "knowledge-runtime" is already bound',
    )
  ) {
    throw new Error(
      `Runtime binding test failed with unexpected error: ${message}`,
    );
  }
}

console.log(
  "=== K.I.N.G.S. RUNTIME BINDING TEST ===",
);

console.log(
  "Knowledge runtime binding: SUCCESS",
);

console.log(
  "Source inspection runtime binding: SUCCESS",
);

console.log(
  "Runtime implementation lookup: SUCCESS",
);

console.log(
  "Duplicate binding protection: SUCCESS",
);

console.log(
  "RUNTIME-002 runtime binding: SUCCESS",
);
