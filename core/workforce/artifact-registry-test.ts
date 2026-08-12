import {
  ArtifactRegistry,
} from "./artifact-registry";

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

const registry =
  new ArtifactRegistry();

const now =
  new Date().toISOString();

registry.register({
  id:
    "artifact-tree-06-test",
  type:
    "code",
  name:
    "Tree 06 Test Artifact",
  description:
    "Controlled artifact registry test artifact.",
  location:
    "test/tree-06/artifact.ts",
  version:
    "1",
  contentHash:
    "sha256:test",
  createdByAgentId:
    "agent-tree-06-test",
  taskId:
    "task-tree-06-test",
  missionId:
    "mission-tree-06-test",
  createdAt:
    now,
});

assert(
  registry.has(
    "artifact-tree-06-test",
  ),
  "Registered artifact must be retrievable.",
);

assert(
  registry.get(
    "artifact-tree-06-test",
  )?.name ===
    "Tree 06 Test Artifact",
  "Artifact data must be preserved.",
);

const rejected =
  registry.promote(
    "artifact-tree-06-test",
    [],
  );

assert(
  !rejected.promoted,
  "Artifact promotion without verification must fail.",
);

const promoted =
  registry.promote(
    "artifact-tree-06-test",
    [
      "verification:tree-06-test",
    ],
  );

assert(
  promoted.promoted,
  "Artifact promotion with verification must succeed.",
);

let duplicateRejected =
  false;

try {
  registry.register({
    id:
      "artifact-tree-06-test",
    type:
      "code",
    name:
      "Duplicate",
    description:
      "Duplicate artifact.",
    createdAt:
      now,
  });
} catch {
  duplicateRejected =
    true;
}

assert(
  duplicateRejected,
  "Duplicate artifact identifiers must be rejected.",
);

console.log(
  "TREE-06 artifact registry: SUCCESS",
);
console.log(
  "TREE-06 artifact promotion gate: SUCCESS",
);
