import type {
  WorkforceResult,
} from "./types";

import {
  SafeContextCompressionAuthority,
} from "./safe-context-compression";

import type {
  ToolOutputClassificationDecision,
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
    artifactIds?: string[];
    verificationReferences?: string[];
  } = {},
): WorkforceResult {
  return {
    id,
    taskId:
      "task-tree-03-6",
    agentId:
      "agent-tree-03-6",
    status,
    summary,
    artifactIds:
      options.artifactIds ?? [],
    reasoning:
      undefined,
    verificationReferences:
      options.verificationReferences ?? [],
    createdAt:
      new Date().toISOString(),
  };
}

function classification(
  overrides:
    Partial<ToolOutputClassificationDecision> = {},
): ToolOutputClassificationDecision {
  return {
    resultId:
      "result-tree-03-6",
    classification:
      "compressible",
    reasons: [
      "Safe compression test candidate.",
    ],
    preserveOriginal:
      true,
    compressible:
      true,
    evidenceBearing:
      false,
    stateChanging:
      false,
    ...overrides,
  };
}

const authority =
  new SafeContextCompressionAuthority({
    minimumCharacters: 100,
    minimumSavingsCharacters: 20,
    minimumSavingsRatio: 0.05,
    maximumLinesPerSection: 20,
  });

const repeatedOutput =
  [
    "Build diagnostic information.",
    "Build diagnostic information.",
    "Build diagnostic information.",
    "Build diagnostic information.",
    "Build diagnostic information.",
    "Build diagnostic information.",
    "Build diagnostic information.",
    "Build diagnostic information.",
    "Build diagnostic information.",
    "Build diagnostic information.",
    "",
    "",
    "Additional diagnostic information.",
    "Additional diagnostic information.",
    "Additional diagnostic information.",
    "Additional diagnostic information.",
    "Additional diagnostic information.",
    "Additional diagnostic information.",
    "Additional diagnostic information.",
    "Additional diagnostic information.",
    "Additional diagnostic information.",
    "Additional diagnostic information.",
  ].join(
    "\n",
  ) +
  "\n" +
  "x".repeat(
    500,
  );

const repeatedResult =
  result(
    "result-compressible",
    "success",
    "Large repeated diagnostic output.",
  );

const compressed =
  authority.compress({
    result:
      repeatedResult,
    classification:
      classification({
        resultId:
          repeatedResult.id,
      }),
    rawOutput:
      repeatedOutput,
  });

assert(
  compressed.usedOptimization,
  "Safe deterministic output should be optimized.",
);

assert(
  !compressed.fallbackToOriginal,
  "Successful compression must not fall back.",
);

assert(
  compressed.optimizedCharacters <
    compressed.originalCharacters,
  "Optimized output must be smaller.",
);

assert(
  compressed.charactersSaved > 0,
  "Compression must report character savings.",
);

console.log(
  "03.6 deterministic safe compression: SUCCESS",
);

const shortOutput =
  "Short output that should not be compressed.";

const shortResult =
  result(
    "result-short",
    "success",
    shortOutput,
  );

const shortCompression =
  authority.compress({
    result:
      shortResult,
    classification:
      classification({
        resultId:
          shortResult.id,
      }),
    rawOutput:
      shortOutput,
  });

assert(
  shortCompression.fallbackToOriginal,
  "Below-threshold output must return the original.",
);

assert(
  shortCompression.optimizedOutput ===
    shortOutput,
  "Below-threshold output must remain unchanged.",
);

console.log(
  "03.6 minimum-threshold preservation: SUCCESS",
);

const evidenceResult =
  result(
    "result-evidence",
    "success",
    "Large verification report.",
    {
      verificationReferences: [
        "verification/tree-03-6",
      ],
      artifactIds: [
        "artifact/tree-03-6-report",
      ],
    },
  );

const evidenceOutput =
  [
    "Verification evidence:",
    "verification/tree-03-6",
    "artifact/tree-03-6-report",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
  ].join(
    "\n",
  ) +
  "\n" +
  "z".repeat(
    500,
  );

const evidenceCompression =
  authority.compress({
    result:
      evidenceResult,
    classification:
      classification({
        resultId:
          evidenceResult.id,
        evidenceBearing:
          true,
      }),
    rawOutput:
      evidenceOutput,
  });

assert(
  evidenceCompression.usedOptimization,
  "Evidence-bearing output may be compressed when preservation succeeds.",
);

assert(
  evidenceCompression.optimizedOutput.includes(
    "verification/tree-03-6",
  ),
  "Verification reference must survive compression.",
);

assert(
  evidenceCompression.optimizedOutput.includes(
    "artifact/tree-03-6-report",
  ),
  "Artifact reference must survive compression.",
);

console.log(
  "03.6 evidence and artifact preservation: SUCCESS",
);

const criticalResult =
  result(
    "result-critical",
    "failure",
    "Execution failed with critical diagnostic information.",
  );

const criticalOutput =
  "Execution failed.\n" +
  "Critical diagnostic information.\n" +
  "x".repeat(
    1000,
  );

const criticalCompression =
  authority.compress({
    result:
      criticalResult,
    classification:
      classification({
        resultId:
          criticalResult.id,
        classification:
          "critical",
        compressible:
          true,
      }),
    rawOutput:
      criticalOutput,
  });

assert(
  criticalCompression.fallbackToOriginal,
  "Critical failure output must be preserved.",
);

assert(
  criticalCompression.optimizedOutput ===
    criticalOutput,
  "Critical failure output must return unchanged.",
);

assert(
  criticalCompression.preservedFailureState,
  "Failure state must be preserved.",
);

console.log(
  "03.6 critical failure preservation: SUCCESS",
);

const stateChangeResult =
  result(
    "result-state-change",
    "success",
    "Created and committed a state-changing operation.",
  );

const stateChangeOutput =
  "Created and committed a state-changing operation.\n" +
  "x".repeat(
    1000,
  );

const stateChangeCompression =
  authority.compress({
    result:
      stateChangeResult,
    classification:
      classification({
        resultId:
          stateChangeResult.id,
        classification:
          "state-changing",
        compressible:
          true,
        stateChanging:
          true,
      }),
    rawOutput:
      stateChangeOutput,
  });

assert(
  stateChangeCompression.fallbackToOriginal,
  "State-changing output must remain uncompressed.",
);

assert(
  stateChangeCompression.optimizedOutput ===
    stateChangeOutput,
  "State-changing output must return unchanged.",
);

console.log(
  "03.6 state-change preservation: SUCCESS",
);

const invalidEvidenceResult =
  result(
    "result-invalid-evidence",
    "success",
    "Large verification report.",
    {
      verificationReferences: [
        "verification/must-survive",
      ],
    },
  );

const invalidEvidenceOutput =
  [
    "Verification evidence follows.",
    "verification/must-survive",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
    "Repeated diagnostic information.",
  ].join(
    "\n",
  ) +
  "\n" +
  "q".repeat(
    1000,
  );

const unsafeAuthority =
  new SafeContextCompressionAuthority({
    minimumCharacters: 100,
    minimumSavingsCharacters: 20,
    minimumSavingsRatio: 0.01,
    maximumLinesPerSection: 20,
  });

const unsafeCompression =
  unsafeAuthority.compress({
    result:
      invalidEvidenceResult,
    classification:
      classification({
        resultId:
          invalidEvidenceResult.id,
        evidenceBearing:
          true,
      }),
    rawOutput:
      invalidEvidenceOutput.replace(
        "verification/must-survive",
        "verification/removed",
      ),
  });

assert(
  unsafeCompression.fallbackToOriginal,
  "Unsafe preservation must trigger fallback.",
);

assert(
  unsafeCompression.optimizedOutput ===
    unsafeCompression.originalOutput,
  "Unsafe optimization must return the original.",
);

console.log(
  "03.6 failed-validation fallback: SUCCESS",
);

const notCompressibleResult =
  result(
    "result-not-compressible",
    "success",
    "Large output.",
  );

const notCompressibleOutput =
  "Large output.\n".repeat(
    100,
  );

const notCompressible =
  authority.compress({
    result:
      notCompressibleResult,
    classification:
      classification({
        resultId:
          notCompressibleResult.id,
        compressible:
          false,
      }),
    rawOutput:
      notCompressibleOutput,
  });

assert(
  notCompressible.fallbackToOriginal,
  "Non-compressible classifications must return the original.",
);

assert(
  notCompressible.optimizedOutput ===
    notCompressibleOutput,
  "Non-compressible output must remain unchanged.",
);

console.log(
  "03.6 classification boundary preservation: SUCCESS",
);

console.log(
  "TREE-03.6 SAFE COMPRESSION: SUCCESS",
);
