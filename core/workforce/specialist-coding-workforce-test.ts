import { strict as assert } from "node:assert";
import { WorkforceRegistry } from "./registry";
import { SpecialistCodingWorkforceAuthority } from "./specialist-coding-workforce";

const registry = new WorkforceRegistry();
for (const tool of [
  { id: "repo", name: "Repository", description: "repo", capabilities: ["read"], enabled: true },
  { id: "edit", name: "Editor", description: "edit", capabilities: ["write"], enabled: true },
  { id: "verify", name: "Verifier", description: "verify", capabilities: ["execute"], enabled: true },
  { id: "web", name: "Research", description: "web", capabilities: ["network"], enabled: true },
]) registry.registerTool(tool);

const authority = new SpecialistCodingWorkforceAuthority();
const policy = {
  repositoryInspectionToolId: "repo",
  fileMutationToolId: "edit",
  buildTestToolId: "verify",
  webResearchToolId: "web",
};
const agents = authority.register(registry, policy);
assert.equal(agents.length, 7);
assert.equal(registry.listAgents().length, 7);

const pipeline = authority.createPipeline(
  "mission-specialists",
  "Harden the production coding machine",
  "2026-09-04T17:40:00.000Z",
  policy,
);
const roles = pipeline.agents.map((agent) => agent.role);
assert.deepEqual(roles, [
  "coding-explorer",
  "coding-architect",
  "coding-implementer",
  "coding-tester",
  "coding-debugger",
  "coding-reviewer",
  "coding-security-reviewer",
]);
assert.equal(pipeline.tasks.length, 7);
assert.equal(pipeline.tasks[0].status, "ready");
for (let index = 1; index < pipeline.tasks.length; index += 1) {
  assert.deepEqual(
    pipeline.tasks[index].dependencyIds,
    [pipeline.tasks[index - 1].id],
    "specialist evidence handoff chain was not preserved",
  );
}
assert(pipeline.tasks[0].requiredToolIds.includes("repo"));
assert(pipeline.tasks[0].requiredToolIds.includes("web"));
assert(pipeline.tasks[2].requiredToolIds.includes("edit"));
assert(pipeline.tasks[3].requiredToolIds.includes("verify"));
assert(pipeline.tasks[6].requiredToolIds.includes("verify"));
assert(pipeline.workflow.requiresApproval);
assert.match(pipeline.workflow.description, /Explorer.*architect.*implementer.*tester.*debugger.*reviewer.*security reviewer/i);

console.log("SPECIALIST-WORKFORCE-001 seven-role coding workforce: SUCCESS");
console.log("SPECIALIST-WORKFORCE-002 explicit evidence dependency chain: SUCCESS");
console.log("SPECIALIST-WORKFORCE-003 least-authority tool policy per specialist: SUCCESS");
console.log("K.I.N.G.S. SPECIALIST CODING WORKFORCE: SUCCESS");
