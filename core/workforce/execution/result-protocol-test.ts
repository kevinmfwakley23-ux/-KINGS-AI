import {
  createWorkforceResult,
} from "./result-protocol";

const result = createWorkforceResult(
  {
    taskId: "task-result-protocol-test",
    agentId: "agent-result-protocol-test",
  },
  {
    status: "success",
    summary:
      "External execution completed successfully.",
    reasoning:
      "The result protocol converted the external runtime response into the K.I.N.G.S. result contract.",
    artifactIds: [
      "artifact-test-output",
    ],
    verificationReferences: [
      "verification-result-protocol-test",
    ],
  },
);

console.log(
  "=== K.I.N.G.S. RESULT PROTOCOL TEST ===",
);

console.log(
  JSON.stringify(result, null, 2),
);

if (result.status !== "success") {
  throw new Error(
    "Result protocol test failed: expected success status.",
  );
}

if (
  result.taskId !==
  "task-result-protocol-test"
) {
  throw new Error(
    "Result protocol test failed: task ID mismatch.",
  );
}

if (
  result.agentId !==
  "agent-result-protocol-test"
) {
  throw new Error(
    "Result protocol test failed: agent ID mismatch.",
  );
}

if (
  result.artifactIds.length !== 1
) {
  throw new Error(
    "Result protocol test failed: artifact mapping mismatch.",
  );
}

if (
  result.verificationReferences.length !== 1
) {
  throw new Error(
    "Result protocol test failed: verification mapping mismatch.",
  );
}

console.log(
  "Result protocol test: SUCCESS",
);
