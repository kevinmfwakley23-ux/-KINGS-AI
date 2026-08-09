import {
  WorkforceRuntimeRegistry,
} from "./runtime-registry";

const registry =
  new WorkforceRuntimeRegistry();

registry.register({
  id: "knowledge-runtime",
  name: "K.I.N.G.S. Knowledge Runtime",
  type: "knowledge",
  description:
    "Provides authoritative project knowledge retrieval.",
  enabled: true,
});

registry.register({
  id: "source-inspection-runtime",
  name: "K.I.N.G.S. Source Inspection Runtime",
  type: "source",
  description:
    "Inspects authorized project source content.",
  enabled: true,
});

const knowledge =
  registry.get(
    "knowledge-runtime",
  );

if (!knowledge) {
  throw new Error(
    "Runtime registry test failed: knowledge runtime was not found.",
  );
}

if (
  knowledge.type !== "knowledge"
) {
  throw new Error(
    "Runtime registry test failed: runtime type mismatch.",
  );
}

const runtimes =
  registry.list();

if (runtimes.length !== 2) {
  throw new Error(
    `Runtime registry test failed: expected 2 runtimes, found ${runtimes.length}.`,
  );
}

try {
  registry.register({
    id: "knowledge-runtime",
    name: "Duplicate",
    type: "knowledge",
    description:
      "Intentional duplicate registration test.",
    enabled: true,
  });

  throw new Error(
    "Runtime registry test failed: duplicate registration was allowed.",
  );
} catch (error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  if (
    !message.includes(
      'runtime "knowledge-runtime" is already registered',
    )
  ) {
    throw new Error(
      `Runtime registry test failed with unexpected error: ${message}`,
    );
  }
}

console.log(
  "=== K.I.N.G.S. RUNTIME REGISTRY TEST ===",
);

console.log(
  "Runtime registration: SUCCESS",
);

console.log(
  "Runtime lookup: SUCCESS",
);

console.log(
  "Runtime listing: SUCCESS",
);

console.log(
  "Duplicate registration protection: SUCCESS",
);

console.log(
  "RUNTIME-001 runtime abstraction: SUCCESS",
);
