import type { WorkforceRegistry } from "./registry";
import type { AgentDefinition, ID, Task, Workflow } from "./types";

export type CodingSpecialistRole =
  | "explorer"
  | "architect"
  | "implementer"
  | "tester"
  | "debugger"
  | "reviewer"
  | "security-reviewer";

export interface CodingSpecialistToolPolicy {
  repositoryInspectionToolId?: ID;
  fileMutationToolId?: ID;
  buildTestToolId?: ID;
  webResearchToolId?: ID;
}

export interface SpecialistCodingPipeline {
  agents: AgentDefinition[];
  tasks: Task[];
  workflow: Workflow;
}

const ROLE_CAPABILITIES: Record<CodingSpecialistRole, string[]> = {
  explorer: ["source-inspection", "research", "reasoning", "repository-mapping"],
  architect: ["reasoning", "planning", "architecture", "dependency-analysis"],
  implementer: ["coding", "debugging", "source-inspection", "recovery"],
  tester: ["verification", "testing", "build-test", "failure-diagnosis"],
  debugger: ["debugging", "failure-diagnosis", "coding", "recovery"],
  reviewer: ["review", "verification", "reasoning", "regression-analysis"],
  "security-reviewer": ["security-review", "verification", "source-inspection", "policy-analysis"],
};

function agentId(role: CodingSpecialistRole): string {
  return `agent-coding-specialist-${role}`;
}

function toolsFor(role: CodingSpecialistRole, policy: CodingSpecialistToolPolicy): ID[] {
  const values: Array<ID | undefined> = [];
  if (["explorer", "architect", "implementer", "reviewer", "security-reviewer"].includes(role)) {
    values.push(policy.repositoryInspectionToolId);
  }
  if (["implementer", "debugger"].includes(role)) {
    values.push(policy.fileMutationToolId);
  }
  if (["tester", "debugger", "reviewer", "security-reviewer"].includes(role)) {
    values.push(policy.buildTestToolId);
  }
  if (role === "explorer") values.push(policy.webResearchToolId);
  return [...new Set(values.filter((value): value is ID => Boolean(value)))];
}

export class SpecialistCodingWorkforceAuthority {
  definitions(policy: CodingSpecialistToolPolicy = {}): AgentDefinition[] {
    const roles: CodingSpecialistRole[] = [
      "explorer",
      "architect",
      "implementer",
      "tester",
      "debugger",
      "reviewer",
      "security-reviewer",
    ];
    return roles.map((role) => ({
      id: agentId(role),
      name: role === "security-reviewer"
        ? "K.I.N.G.S. Security Reviewer"
        : `K.I.N.G.S. ${role[0].toUpperCase()}${role.slice(1)}`,
      role: `coding-${role}`,
      description: this.description(role),
      capabilities: [...ROLE_CAPABILITIES[role]],
      toolIds: toolsFor(role, policy),
      status: "available",
    }));
  }

  register(registry: WorkforceRegistry, policy: CodingSpecialistToolPolicy = {}): AgentDefinition[] {
    const definitions = this.definitions(policy);
    for (const agent of definitions) {
      if (!registry.getAgent(agent.id)) registry.registerAgent(agent);
    }
    return definitions;
  }

  createPipeline(
    missionId: ID,
    objective: string,
    now = new Date().toISOString(),
    policy: CodingSpecialistToolPolicy = {},
  ): SpecialistCodingPipeline {
    if (!missionId.trim()) throw new Error("K.I.N.G.S. Specialist Workforce: mission id is required.");
    if (!objective.trim()) throw new Error("K.I.N.G.S. Specialist Workforce: objective is required.");
    const agents = this.definitions(policy);
    const roles: CodingSpecialistRole[] = [
      "explorer",
      "architect",
      "implementer",
      "tester",
      "debugger",
      "reviewer",
      "security-reviewer",
    ];
    const tasks: Task[] = roles.map((role, index) => {
      const prior = index === 0 ? [] : [`${missionId}-specialist-${roles[index - 1]}`];
      return {
        id: `${missionId}-specialist-${role}`,
        missionId,
        name: `Specialist ${role}`,
        description: `${this.description(role)} Mission objective: ${objective}`,
        assignedAgentId: agentId(role),
        requiredCapabilities: [...ROLE_CAPABILITIES[role]],
        requiredToolIds: toolsFor(role, policy),
        status: index === 0 ? "ready" : "pending",
        dependencyIds: prior,
        inputReferences: index === 0 ? [] : prior.map((id) => `result:${id}`),
        expectedOutputs: [this.expectedOutput(role)],
        createdAt: now,
        updatedAt: now,
      };
    });
    const workflow: Workflow = {
      id: `${missionId}-specialist-coding-workflow`,
      missionId,
      name: "K.I.N.G.S. Specialist Coding Pipeline",
      description:
        "Explorer → architect → implementer → tester → debugger → reviewer → security reviewer, with explicit evidence handoffs and tool authorization at each boundary.",
      taskIds: tasks.map((task) => task.id),
      requiresApproval: true,
    };
    return { agents, tasks, workflow };
  }

  private description(role: CodingSpecialistRole): string {
    switch (role) {
      case "explorer":
        return "Maps the repository, relevant symbols, dependencies, build system, tests, and evidence before code changes are proposed.";
      case "architect":
        return "Turns verified repository evidence into the smallest complete architecture/change plan and identifies dependency impact.";
      case "implementer":
        return "Writes bounded production code from the approved architecture without weakening verification or inventing unseen source.";
      case "tester":
        return "Builds and executes criterion-bound tests and reports exact failures instead of treating generated code as success.";
      case "debugger":
        return "Diagnoses failed verification, applies bounded repairs, and returns evidence for retesting.";
      case "reviewer":
        return "Reviews behavior, regressions, architecture drift, maintainability, and acceptance evidence before promotion.";
      case "security-reviewer":
        return "Performs a final security and governance review for secrets, path escape, unsafe tools, policy bypass, and dependency risk.";
    }
  }

  private expectedOutput(role: CodingSpecialistRole): string {
    const outputs: Record<CodingSpecialistRole, string> = {
      explorer: "repository evidence map",
      architect: "bounded implementation plan",
      implementer: "code change proposal",
      tester: "build/test evidence",
      debugger: "diagnosis and verified repair",
      reviewer: "regression and quality review",
      "security-reviewer": "security/governance review",
    };
    return outputs[role];
  }
}
