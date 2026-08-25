import type { ID, Task } from "./types";
import type { MissionPlan } from "./mission-continuity";

export type ApplicationBuildLane =
  | "architecture"
  | "research"
  | "backend"
  | "frontend"
  | "memory"
  | "integration"
  | "quality"
  | "release";

export interface ApplicationBuildDecompositionRequest {
  missionId: ID;
  missionPlan: MissionPlan;
  objective: string;
  requirements: string[];
  acceptanceCriteria: string[];
}

export interface ApplicationBuildTask extends Task {
  lane: ApplicationBuildLane;
}

export interface ApplicationBuildDecomposition {
  missionId: ID;
  lanes: ApplicationBuildLane[];
  tasks: ApplicationBuildTask[];
  rootTaskId: ID;
}

/**
 * Converts a product-level application mission into a deterministic,
 * dependency-aware engineering program. Execution remains delegated to
 * the workforce/runtime authorities; this authority only creates the graph.
 */
export class ApplicationBuildDecomposer {
  decompose(request: ApplicationBuildDecompositionRequest): ApplicationBuildDecomposition {
    if (!request.missionPlan.locked || !request.missionPlan.approvedByHuman) {
      throw new Error(
        "K.I.N.G.S. Application Build Decomposer: mission plan must be approved and locked before decomposition",
      );
    }

    const now = new Date().toISOString();
    const rootTaskId = `task-${request.missionId}-architecture`;
    const lanes: ApplicationBuildLane[] = [
      "architecture",
      "research",
      "backend",
      "frontend",
      "memory",
      "integration",
      "quality",
      "release",
    ];

    const makeTask = (
      lane: ApplicationBuildLane,
      id: string,
      name: string,
      description: string,
      dependencyIds: string[],
      capabilities: string[],
    ): ApplicationBuildTask => ({
      id,
      missionId: request.missionId,
      name,
      description,
      requiredCapabilities: capabilities,
      requiredToolIds: ["tool-execution-sandbox"],
      status: dependencyIds.length === 0 ? "ready" : "pending",
      dependencyIds,
      inputReferences: ["project-owner-vision", request.missionPlan.id],
      expectedOutputs: ["verified work", "verification evidence"],
      createdAt: now,
      updatedAt: now,
      lane,
    });

    const architecture = makeTask(
      "architecture",
      rootTaskId,
      "Define application architecture",
      `${request.objective} Requirements: ${request.requirements.join(" | ")}`,
      [],
      ["planning", "architecture", "reasoning"],
    );

    const research = makeTask(
      "research",
      `task-${request.missionId}-research`,
      "Resolve product research and capability gaps",
      "Research external knowledge and capabilities required to build the application, under governed approval and provenance rules.",
      [rootTaskId],
      ["research", "reasoning", "source-inspection"],
    );

    const backend = makeTask(
      "backend",
      `task-${request.missionId}-backend`,
      "Build application backend",
      "Implement backend services, APIs, persistence, security, and runtime integration.",
      [rootTaskId, research.id],
      ["coding", "debugging", "verification"],
    );

    const frontend = makeTask(
      "frontend",
      `task-${request.missionId}-frontend`,
      "Build application frontend",
      "Implement the user-facing application experience for the target platforms.",
      [rootTaskId, research.id],
      ["coding", "debugging", "verification"],
    );

    const memory = makeTask(
      "memory",
      `task-${request.missionId}-memory`,
      "Implement project and application memory",
      "Implement durable project knowledge, continuity, retrieval, and state needed by the application.",
      [backend.id, frontend.id],
      ["coding", "reasoning", "verification"],
    );

    const integration = makeTask(
      "integration",
      `task-${request.missionId}-integration`,
      "Integrate application subsystems",
      "Integrate frontend, backend, memory, tool integrations, and governed workflows into one runnable application.",
      [backend.id, frontend.id, memory.id],
      ["coding", "debugging", "verification", "integration"],
    );

    const quality = makeTask(
      "quality",
      `task-${request.missionId}-quality`,
      "Run system verification and repair",
      "Run build, test, review, recovery, and repair loops until acceptance criteria are satisfied.",
      [integration.id],
      ["testing", "debugging", "verification", "recovery"],
    );

    const release = makeTask(
      "release",
      `task-${request.missionId}-release`,
      "Prepare production release",
      `Prepare the completed application for release against acceptance criteria: ${request.acceptanceCriteria.join(" | ")}`,
      [quality.id],
      ["verification", "release", "documentation"],
    );

    return {
      missionId: request.missionId,
      lanes,
      tasks: [architecture, research, backend, frontend, memory, integration, quality, release],
      rootTaskId,
    };
  }
}
