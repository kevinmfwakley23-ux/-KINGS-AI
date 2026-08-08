import type {
  AgentDefinition,
  ID,
  Mission,
  Task,
  ToolDefinition,
  Workflow,
} from "./types";

export class WorkforceRegistry {
  private readonly agents = new Map<ID, AgentDefinition>();
  private readonly tools = new Map<ID, ToolDefinition>();
  private readonly missions = new Map<ID, Mission>();
  private readonly tasks = new Map<ID, Task>();
  private readonly workflows = new Map<ID, Workflow>();

  registerAgent(agent: AgentDefinition): void {
    this.assertUnique(this.agents, agent.id, "agent");
    this.agents.set(agent.id, agent);
  }

  registerTool(tool: ToolDefinition): void {
    this.assertUnique(this.tools, tool.id, "tool");
    this.tools.set(tool.id, tool);
  }

  registerMission(mission: Mission): void {
    this.assertUnique(this.missions, mission.id, "mission");
    this.missions.set(mission.id, mission);
  }

  registerTask(task: Task): void {
    this.assertUnique(this.tasks, task.id, "task");
    this.tasks.set(task.id, task);
  }

  registerWorkflow(workflow: Workflow): void {
    this.assertUnique(this.workflows, workflow.id, "workflow");
    this.workflows.set(workflow.id, workflow);
  }

  getAgent(id: ID): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  getTool(id: ID): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  getMission(id: ID): Mission | undefined {
    return this.missions.get(id);
  }

  getTask(id: ID): Task | undefined {
    return this.tasks.get(id);
  }

  getWorkflow(id: ID): Workflow | undefined {
    return this.workflows.get(id);
  }

  listAgents(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  listTools(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  listMissions(): Mission[] {
    return [...this.missions.values()];
  }

  listTasks(): Task[] {
    return [...this.tasks.values()];
  }

  listWorkflows(): Workflow[] {
    return [...this.workflows.values()];
  }

  clear(): void {
    this.agents.clear();
    this.tools.clear();
    this.missions.clear();
    this.tasks.clear();
    this.workflows.clear();
  }

  private assertUnique<T>(
    collection: Map<ID, T>,
    id: ID,
    type: string,
  ): void {
    if (collection.has(id)) {
      throw new Error(
        `K.I.N.G.S. Workforce Registry: duplicate ${type} id "${id}"`,
      );
    }
  }
}
