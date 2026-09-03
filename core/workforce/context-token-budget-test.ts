import type { Evidence, KnowledgeRecord, MemoryResult } from "./types";
import { ContextTokenBudgetPlanner } from "./context-token-budget";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const now = "2026-09-02T00:00:00.000Z";

function record(id: string, authoritative: boolean, contentSize: number, evidenceId: string): KnowledgeRecord {
  return {
    id,
    sourceId: `source-${id}`,
    memoryType: "semantic",
    summary: `Important project knowledge for ${id}.`,
    content: `${id} `.repeat(contentSize),
    evidenceIds: [evidenceId],
    authoritative,
    createdAt: now,
    updatedAt: now,
  };
}

function evidence(id: string, sourceId: string, excerptSize: number): Evidence {
  return {
    id,
    sourceId,
    description: `Verification evidence for ${id}.`,
    location: `docs/${sourceId}.md`,
    excerpt: `${id} evidence `.repeat(excerptSize),
    createdAt: now,
  };
}

const records = [
  record("non-authoritative-large", false, 180, "evidence-non-authoritative"),
  record("authoritative-core", true, 160, "evidence-authoritative"),
  record("secondary", false, 120, "evidence-secondary"),
];
const evidenceItems = [
  evidence("evidence-non-authoritative", "source-non-authoritative-large", 100),
  evidence("evidence-authoritative", "source-authoritative-core", 100),
  evidence("evidence-secondary", "source-secondary", 80),
];

const knowledge: MemoryResult = {
  query: "Build the next governed K.I.N.G.S. execution context.",
  records,
  evidence: evidenceItems,
  sourceIds: records.map((item) => item.sourceId),
  createdAt: now,
};

const originalAuthoritativeContent = records[1].content;
const originalEvidenceExcerpt = evidenceItems[1].excerpt;

const planner = new ContextTokenBudgetPlanner({
  maxEstimatedTokens: 220,
  charactersPerToken: 4,
  recordOverheadTokens: 12,
  evidenceOverheadTokens: 8,
});

const planned = planner.plan(knowledge);

assert(planned.estimatedOriginalTokens > planned.estimatedOptimizedTokens, "Token planner did not reduce an oversized context.");
assert(planned.estimatedOptimizedTokens <= 220, "Optimized context exceeded the governed token budget.");
assert(planned.estimatedTokensSaved > 0, "Token savings were not measured.");
assert(planned.knowledge.records.some((item) => item.id === "authoritative-core"), "Authoritative core knowledge was not prioritized.");
assert(planned.trimmedRecordContentIds.length > 0 || planned.droppedRecordIds.length > 0, "Oversized optional record content was not reduced.");
assert(records[1].content === originalAuthoritativeContent, "Durable knowledge record was mutated during execution-context optimization.");
assert(evidenceItems[1].excerpt === originalEvidenceExcerpt, "Durable evidence was mutated during execution-context optimization.");

const retainedEvidenceIds = new Set(planned.knowledge.evidence.map((item) => item.id));
for (const retainedRecord of planned.knowledge.records) {
  for (const evidenceId of retainedRecord.evidenceIds) {
    assert(retainedEvidenceIds.has(evidenceId), "Token budgeting left an orphaned evidence reference.");
  }
}

const roomyPlanner = new ContextTokenBudgetPlanner({
  maxEstimatedTokens: 20_000,
  charactersPerToken: 4,
  recordOverheadTokens: 12,
  evidenceOverheadTokens: 8,
});
const unchanged = roomyPlanner.plan(knowledge);
assert(unchanged.knowledge === knowledge, "Under-budget context should preserve the original knowledge object.");
assert(unchanged.estimatedTokensSaved === 0, "Under-budget context reported phantom savings.");

console.log("Estimated token budget enforcement: SUCCESS");
console.log("Authoritative knowledge priority: SUCCESS");
console.log("Durable memory immutability: SUCCESS");
console.log("Evidence provenance integrity: SUCCESS");
console.log("Under-budget no-op behavior: SUCCESS");
console.log("TREE-03 CONTEXT TOKEN ECONOMY: SUCCESS");
