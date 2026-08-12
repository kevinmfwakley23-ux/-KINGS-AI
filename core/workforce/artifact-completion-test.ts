import {
  ArtifactRegistry,
} from "./artifact-registry";

import {
  ArtifactCompletionAuthority,
} from "./artifact-completion";

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
    "artifact-tree-06-completion",
  type:
    "code",
  name:
    "Tree 06 Completion Artifact",
  description:
    "Artifact used to verify completion-gate integration.",
  location:
    "test/tree-06/completion.ts",
  createdByAgentId:
    "agent-tree-06",
  taskId:
    "task-tree-06-completion",
  missionId:
    "mission-tree-06",
  createdAt:
    now,
});

const authority =
  new ArtifactCompletionAuthority(
    registry,
  );

const contract = {
  id:
    "work-unit-tree-06-completion",
  role:
    "Artifact completion verification",
  objective:
    "Verify artifact completion is governed by evidence.",
  capabilityIds: [
    "artifact-build",
  ],
  allowedToolIds: [],
  allowedPaths: [],
  budget: {
    maxTimeMs:
      5000,
    maxTokens:
      1000,
    maxIterations:
      1,
  },
  dependencyIds: [],
  acceptanceCriteria: [
    "Artifact completion evidence passes.",
  ],
  requiredEvidenceTypes: [
    "test",
  ],
  approved:
    true,
  createdAt:
    now,
  updatedAt:
    now,
};

const passed =
  authority.evaluate({
    taskId:
      "task-tree-06-completion",
    artifactId:
      "artifact-tree-06-completion",
    contract,
    evidence: [
      {
        id:
          "evidence-tree-06-test",
        type:
          "test",
        criterion:
          "Artifact completion evidence passes.",
        status:
          "passed",
        summary:
          "Artifact completion test passed.",
        verificationReference:
          "test:tree-06-artifact-completion",
        createdAt:
          now,
      },
    ],
  });

assert(
  passed.passed,
  "Artifact completion must pass when required evidence is present.",
);

assert(
  passed.evidenceIds.length ===
    1,
  "Completion evidence identifiers must be preserved.",
);

const failed =
  authority.evaluate({
    taskId:
      "task-tree-06-completion",
    artifactId:
      "artifact-tree-06-completion",
    contract,
    evidence: [],
  });

assert(
  !failed.passed,
  "Artifact completion must fail when required evidence is missing.",
);

assert(
  failed.reasons.some(
    (reason) =>
      reason.includes(
        'Required evidence type "test" is missing.',
      ),
  ),
  "Missing required evidence must be reported.",
);

let mismatchRejected =
  false;

try {
  authority.evaluate({
    taskId:
      "different-task",
    artifactId:
      "artifact-tree-06-completion",
    contract,
    evidence: [],
  });
} catch {
  mismatchRejected =
    true;
}

assert(
  mismatchRejected,
  "Artifact/task provenance mismatch must be rejected.",
);

console.log(
  "TREE-06 artifact completion gate: SUCCESS",
);

console.log(
  "TREE-06 required evidence enforcement: SUCCESS",
);

console.log(
  "TREE-06 artifact/task provenance enforcement: SUCCESS",
);

console.log(
  "TREE-06 ARTIFACT COMPLETION AUTHORITY: SUCCESS",
);
