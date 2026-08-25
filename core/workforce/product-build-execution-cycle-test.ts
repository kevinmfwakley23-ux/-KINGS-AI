import type { Artifact, AgentDefinition, Mission, Task, WorkforceResult } from "./types";
import { WorkforceRegistry } from "./registry";
import { ProductBuildExecutionGateway } from "./product-build-execution-gateway";
import { ProductBuildExecutionCycle } from "./product-build-execution-cycle";
import type { ProductBuildWorkerRunner } from "./product-build-worker-runner";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function now(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const missionId = "mission-forge-cycle-test";
  const mission: Mission = {
    id: missionId,
    name: "AI Author's Forge",
    description: "Prove one governed product-build execution cycle.",
    status: "planned",
    objectives: ["Complete one governed product-build cycle."],
    sourceReferences: ["test"],
    createdAt: now(),
    updatedAt: now(),
  };

  const architect: AgentDefinition = {
    id: "agent-architect",
    name: "Architect",
    role: "architect",
    description: "Designs application architecture.",
    capabilities: ["architecture", "coding"],
    toolIds: ["tool-repo"],
    status: "available",
  };
  registry.registerAgent(architect);
  registry.registerTool({ id: "tool-repo", name: "Repository", description: "Repository access", capabilities: ["repo"], enabled: true });
  registry.registerTask({
    id: "forge-task-architecture",
    missionId,
    name: "Architecture",
    description: "Define architecture.",
    requiredCapabilities: ["architecture"],
    requiredToolIds: ["tool-repo"],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: ["architecture"],
    createdAt: now(),
    updatedAt: now(),
  } satisfies Task);

  const plan = {
    id: "plan-forge-cycle-test",
    missionId,
    version: 1,
    objective: "Test product cycle.",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: ["cycle completes"],
    locked: true,
    approvedByHuman: true,
    createdAt: now(),
    updatedAt: now(),
  };

  const gateway = new ProductBuildExecutionGateway(registry, {
    assemble: () => ({
      missionId,
      decomposition: { productName: "AI Author's Forge", tasks: [] },
      tasks: [],
      registeredTaskIds: [],
    }),
  } as any);

  // Use the gateway's real execution graph by pre-registering the task above.
  const runner: ProductBuildWorkerRunner = {
    async run(context) {
      const result: WorkforceResult = {
        id: "result-forge-architecture",
        taskId: context.dispatch.taskId,
        agentId: context.dispatch.agentId,
        status: "success",
        summary: "Architecture task completed.",
        artifactIds: [],
        verificationReferences: ["test-verification"],
        createdAt: now(),
      };
      return { completed: true, result };
    },
  };

  // Inject the registered mission task into the gateway's coordinator graph by starting once.
  const initial = gateway.start({ mission, plan, ownerVision: "Build AI Author's Forge" });
  void initial;

  const cycle = new ProductBuildExecutionCycle(gateway, runner);
  const snapshot = gateway.snapshot(missionId);
  const result = await cycle.run(snapshot);

  assert(result.completedTaskId === "forge-task-architecture", "architecture task should complete through the cycle");
  assert(result.workforceResult?.status === "success", "successful worker result should be handed off");

  console.log("PRODUCT BUILD EXECUTION CYCLE: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
