import type { ID, Mission, Task } from "./types";
import { WorkforceRegistry } from "./registry";
import type { MissionPlan } from "./mission-continuity";
import {
  ApplicationBuildDecomposer,
  type ApplicationBuildDecomposition,
} from "./application-build-decomposer";

export interface ProductBuildMissionAssemblyRequest {
  mission: Mission;
  plan: MissionPlan;
  ownerVision: string;
}

export interface ProductBuildMissionAssemblyResult {
  missionId: ID;
  decomposition: ApplicationBuildDecomposition;
  tasks: Task[];
  registeredTaskIds: ID[];
}

/**
 * Turns a product vision into a real workforce task graph.
 * This assembler only registers mission work; execution remains governed by
 * the workforce coordinator and specialized authorities.
 */
export class ProductBuildMissionAssembler {
  constructor(
    private readonly registry: WorkforceRegistry,
    private readonly decomposer: ApplicationBuildDecomposer = new ApplicationBuildDecomposer(),
  ) {}

  assemble(request: ProductBuildMissionAssemblyRequest): ProductBuildMissionAssemblyResult {
    if (request.plan.missionId !== request.mission.id) {
      throw new Error("K.I.N.G.S. Product Build Assembly: mission and plan ids must match");
    }
    if (!request.plan.approvedByHuman || !request.plan.locked) {
      throw new Error("K.I.N.G.S. Product Build Assembly: mission plan must be approved and locked before assembly");
    }
    if (!request.ownerVision.trim()) {
      throw new Error("K.I.N.G.S. Product Build Assembly: owner vision is required");
    }

    const decomposition = this.decomposer.decompose({
      missionId: request.mission.id,
      missionPlan: request.plan,
      objective: request.mission.description,
      requirements: request.mission.objectives,
      acceptanceCriteria: request.plan.acceptanceCriteria,
    });

    const now = new Date().toISOString();
    const tasks: Task[] = decomposition.tasks.map((task) => ({
      id: task.id,
      missionId: request.mission.id,
      name: task.name,
      description: task.description,
      requiredCapabilities: [...task.requiredCapabilities],
      requiredToolIds: [...task.requiredToolIds],
      status: task.status,
      dependencyIds: [...task.dependencyIds],
      inputReferences: [...task.inputReferences, "project-owner-vision"],
      expectedOutputs: [...task.expectedOutputs],
      createdAt: now,
      updatedAt: now,
    }));

    for (const task of tasks) {
      if (!this.registry.getTask(task.id)) {
        this.registry.registerTask(task);
      }
    }

    return {
      missionId: request.mission.id,
      decomposition,
      tasks,
      registeredTaskIds: tasks
        .filter((task) => this.registry.getTask(task.id)?.id === task.id)
        .map((task) => task.id),
    };
  }
}
