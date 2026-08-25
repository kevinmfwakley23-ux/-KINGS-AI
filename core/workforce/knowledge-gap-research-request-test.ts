import { KnowledgeGapResearchRequestFactory } from "./knowledge-gap-research-request";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const factory = new KnowledgeGapResearchRequestFactory();

  const request = factory.create({
    id: "research-request-test",
    missionId: "mission-test",
    taskId: "task-test",
    agentId: "agent-test",
    capabilityId: "rust-development",
    question: "What verified toolchain knowledge is required to build Rust on this runtime?",
    rationale: "The current capability registry does not contain a verified Rust toolchain.",
    requestedHosts: ["rust-lang.org"],
    requestedSourceTypes: ["official-documentation"],
    maxSources: 3,
    maxDurationMs: 60_000,
  });

  assert(request.ownerApprovalRequired === true, "research authority must require Project Owner approval");
  assert(request.status === "requested", "new research request must begin in requested state");
  assert(request.capabilityId === "rust-development", "capability gap must remain attributable");
  assert(request.requestedHosts?.[0] === "rust-lang.org", "requested scope must preserve host constraints");

  console.log("KNOWLEDGE GAP → GOVERNED RESEARCH REQUEST: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
