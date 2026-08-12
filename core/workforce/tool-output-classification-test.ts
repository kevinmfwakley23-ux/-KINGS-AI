import type {
  WorkforceResult,
} from "./types";

import {
  ToolOutputClassificationAuthority,
} from "./tool-output-classification";

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

function result(
  id: string,
  status:
    WorkforceResult["status"],
  summary: string,
  options: {
    reasoning?: string;
    artifactIds?: string[];
    verificationReferences?: string[];
  } = {},
): WorkforceResult {
  return {
    id,
    taskId:
      "task-tree-03-5",
    agentId:
      "agent-tree-03-5",
    status,
    summary,
    artifactIds:
      options.artifactIds ?? [],
    reasoning:
      options.reasoning,
    verificationReferences:
      options.verificationReferences ?? [],
    createdAt:
      new Date().toISOString(),
  };
}

const authority =
  new ToolOutputClassificationAuthority();

const failure =
  authority.classify({
    result:
      result(
        "result-failure",
        "failure",
        "Execution failed while writing the requested file.",
      ),
  });

assert(
  failure.classification ===
    "critical",
  "Execution failure must be classified as critical.",
);

assert(
  failure.preserveOriginal,
  "Execution failure must preserve the original result.",
);

assert(
  !failure.compressible,
  "Execution failure must not be marked compressible.",
);

console.log(
  "03.5 failure output classification: SUCCESS",
);

const evidence =
  authority.classify({
    result:
      result(
        "result-evidence",
        "success",
        "Build completed successfully.",
        {
          verificationReferences: [
            "test-report-123",
          ],
        },
      ),
  });

assert(
  evidence.classification ===
    "evidence",
  "Verification-bearing output must be classified as evidence.",
);

assert(
  evidence.evidenceBearing,
  "Evidence-bearing output must retain evidence status.",
);

assert(
  evidence.preserveOriginal,
  "Evidence-bearing output must preserve the original.",
);

console.log(
  "03.5 evidence classification: SUCCESS",
);

const stateChanging =
  authority.classify({
    result:
      result(
        "result-state-change",
        "success",
        "Created and committed the new workforce configuration.",
      ),
  });

assert(
  stateChanging.classification ===
    "state-changing",
  "State-changing output must be classified as state-changing.",
);

assert(
  stateChanging.stateChanging,
  "State-changing output must preserve state-change information.",
);

assert(
  stateChanging.preserveOriginal,
  "State-changing output must preserve the original.",
);

console.log(
  "03.5 state-changing output classification: SUCCESS",
);

const artifact =
  authority.classify({
    result:
      result(
        "result-artifact",
        "success",
        "Generated the requested implementation artifact.",
        {
          artifactIds: [
            "artifact-123",
          ],
        },
      ),
  });

assert(
  artifact.classification ===
    "relevant",
  "Artifact-producing output must remain relevant.",
);

assert(
  artifact.preserveOriginal,
  "Artifact-producing output must preserve the original.",
);

console.log(
  "03.5 artifact-bearing output classification: SUCCESS",
);

const redundant =
  authority.classify({
    result:
      result(
        "result-redundant",
        "success",
        "Build completed successfully and the requested build completed successfully.",
        {
          reasoning:
            "The build completed successfully and the requested build completed successfully.",
        },
      ),
  });

assert(
  redundant.classification ===
    "redundant",
  "Repeated output must be classified as redundant.",
);

assert(
  redundant.compressible,
  "Redundant output must be eligible for compression.",
);

console.log(
  "03.5 redundant output classification: SUCCESS",
);

const noisy =
  authority.classify({
    result:
      result(
        "result-noisy",
        "success",
        "",
      ),
    rawOutput:
      "",
  });

assert(
  noisy.classification ===
    "noisy",
  "Empty output must be classified as noise.",
);

assert(
  noisy.compressible,
  "Noise must be eligible for removal/compression.",
);

console.log(
  "03.5 noisy output classification: SUCCESS",
);

const longOutput =
  "line of useful execution information\n".repeat(
    30,
  );

const compressible =
  authority.classify({
    result:
      result(
        "result-compressible",
        "success",
        "Execution completed with extensive diagnostic output.",
      ),
    rawOutput:
      longOutput,
  });

assert(
  compressible.classification ===
    "compressible",
  "Large diagnostic output must be classified as compressible.",
);

assert(
  compressible.compressible,
  "Compressible output must be marked compressible.",
);

assert(
  compressible.preserveOriginal,
  "Compression candidates must preserve the original until validation.",
);

console.log(
  "03.5 compressible output classification: SUCCESS",
);

const relevant =
  authority.classify({
    result:
      result(
        "result-relevant",
        "success",
        "The requested analysis completed and identified three actionable implementation changes.",
      ),
  });

assert(
  relevant.classification ===
    "relevant",
  "Normal substantive output must remain relevant.",
);

assert(
  relevant.preserveOriginal,
  "Relevant output must preserve the original.",
);

console.log(
  "03.5 relevant output classification: SUCCESS",
);

const many =
  authority.classifyMany([
    {
      result:
        result(
          "result-z",
          "success",
          "Normal result.",
        ),
    },
    {
      result:
        result(
          "result-a",
          "success",
          "Normal result.",
        ),
    },
  ]);

assert(
  many[0].resultId ===
    "result-a" &&
  many[1].resultId ===
    "result-z",
  "Batch classification must be deterministic.",
);

console.log(
  "03.5 deterministic batch classification: SUCCESS",
);

const original =
  authority.classify({
    result:
      result(
        "result-original",
        "success",
        "Execution produced a successful result.",
      ),
  });

assert(
  original.preserveOriginal,
  "Classification must never discard the original result.",
);

console.log(
  "03.5 original-result preservation boundary: SUCCESS",
);

console.log(
  "TREE-03.5 TOOL OUTPUT CLASSIFICATION: SUCCESS",
);
