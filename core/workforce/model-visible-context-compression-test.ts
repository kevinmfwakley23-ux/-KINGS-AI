import { strict as assert } from "node:assert";
import { SafeContextCompressionAuthority } from "./safe-context-compression";
import { ModelVisibleContextCompressionAuthority } from "./model-visible-context-compression";

const authority = new ModelVisibleContextCompressionAuthority(
  new SafeContextCompressionAuthority({
    minimumCharacters: 100,
    minimumSavingsCharacters: 20,
    minimumSavingsRatio: 0.05,
    maximumLinesPerSection: 20,
  }),
);

const repeatedRepositoryContext = [
  "K.I.N.G.S. SYMBOL + DEPENDENCY CONTEXT",
  "SYMBOL: src/search.ts:10-14 function searchInventory [exported]",
  "export function searchInventory(query: string) {",
  "  return normalizeInventoryQuery(query);",
  "}",
  "SYMBOL: src/normalize.ts:1-3 function normalizeInventoryQuery [exported]",
  "export function normalizeInventoryQuery(query: string) {",
  "  return query.trim().toLowerCase();",
  "}",
  ...Array.from({ length: 24 }, () => "Repeated repository inventory diagnostic."),
  "x".repeat(500),
].join("\n");

const compressed = authority.compress({
  id: "context-repository-1",
  taskId: "task-repository-1",
  agentId: "agent-coding-engineer",
  kind: "repository",
  content: repeatedRepositoryContext,
  requiredAnchors: [
    "searchInventory",
    "normalizeInventoryQuery",
    "src/search.ts",
    "src/normalize.ts",
  ],
});

assert(compressed.usedOptimization, "repository model context should use proven deterministic compression when savings are material");
assert(compressed.preservedRequiredAnchors, "required repository symbol/path anchors were not preserved");
assert(compressed.optimizedOutput.includes("searchInventory"));
assert(compressed.optimizedOutput.includes("normalizeInventoryQuery"));
assert(compressed.charactersSaved > 0, "compression savings were not reported");

const critical = authority.compress({
  id: "context-state-changing-1",
  taskId: "task-state-changing-1",
  agentId: "agent-tool-loop",
  kind: "tool-output",
  content: repeatedRepositoryContext,
  stateChanging: true,
});
assert(critical.fallbackToOriginal, "state-changing tool output must never be compressed");
assert.equal(critical.optimizedOutput, repeatedRepositoryContext);

const evidenceContent = [
  "Verification evidence:",
  "verification/build-123",
  "artifact/build-log-123",
  ...Array.from({ length: 24 }, () => "Repeated test-run diagnostic."),
  "x".repeat(500),
].join("\n");
const evidence = authority.compress({
  id: "context-evidence-1",
  taskId: "task-evidence-1",
  agentId: "agent-reviewer",
  kind: "diagnostic",
  content: evidenceContent,
  evidenceBearing: true,
  verificationReferences: ["verification/build-123"],
  artifactIds: ["artifact/build-log-123"],
  requiredAnchors: ["verification/build-123", "artifact/build-log-123"],
});
assert(evidence.optimizedOutput.includes("verification/build-123"));
assert(evidence.optimizedOutput.includes("artifact/build-log-123"));
assert(evidence.preservedRequiredAnchors);

console.log("MODEL-CONTEXT-COMPRESSION-001 repository symbol anchors preserved: SUCCESS");
console.log("MODEL-CONTEXT-COMPRESSION-002 state-changing tool output preserved in full: SUCCESS");
console.log("MODEL-CONTEXT-COMPRESSION-003 verification/artifact evidence preserved: SUCCESS");
console.log("K.I.N.G.S. MODEL-VISIBLE CONTEXT COMPRESSION: SUCCESS");
