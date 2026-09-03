import type { ModelExecutionRequest } from "./model-interface";
import { ModelTaskComplexityClassifier } from "./model-task-complexity";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function request(content: string, capabilities: ModelExecutionRequest["requiredCapabilities"] = ["reasoning"]): ModelExecutionRequest {
  return {
    id: `request-${content.length}`,
    taskId: "task-complexity",
    missionId: "mission-complexity",
    messages: [{ role: "user", content }],
    requiredCapabilities: capabilities,
    inputModalities: ["text"],
    outputModality: "text",
    maxOutputTokens: 512,
    allowToolProposals: false,
  };
}

const classifier = new ModelTaskComplexityClassifier();

const simple = classifier.classify(request("What is JSON?", []));
assert(simple.tier === "simple", "Short definition request was over-routed.");

const medium = classifier.classify(request(
  "Compare these two implementation approaches and give me the main trade-off.",
  [],
));
assert(medium.tier === "medium", "Normal comparison task did not land in the medium tier.");

const coding = classifier.classify(request(
  "Debug this TypeScript API and refactor the repository code, then run the tests and verify the fix.",
  ["coding", "debugging", "verification"],
));
assert(coding.tier === "reasoning" || coding.tier === "complex", "Coding/debugging task was under-routed.");
assert(coding.signals.includes("coding or debugging work"), "Coding signal was not preserved as routing evidence.");

const deterministicA = classifier.classify(request("Design the distributed orchestration architecture and evaluate latency, throughput, and circuit breaker trade-offs.", ["planning", "reasoning"]));
const deterministicB = classifier.classify(request("Design the distributed orchestration architecture and evaluate latency, throughput, and circuit breaker trade-offs.", ["planning", "reasoning"]));
assert(deterministicA.score === deterministicB.score && deterministicA.tier === deterministicB.tier, "Complexity classification must be deterministic.");
assert(deterministicA.estimatedInputTokens > 0, "Input token estimate was not recorded.");

console.log("Simple request economy: SUCCESS");
console.log("Coding/reasoning escalation: SUCCESS");
console.log("Deterministic zero-call classification: SUCCESS");
console.log("TREE-04 TASK COMPLEXITY ROUTING: SUCCESS");
