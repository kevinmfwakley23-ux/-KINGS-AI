import type { Artifact, ID, Task, WorkforceResult } from "./types";
import { WorkforceRegistry } from "./registry";
import { WorkforceOrchestrator } from "./workforce-orchestrator";

export interface WorkforceHandoff {
  taskId: ID;
  status: "accepted" | "rejected";
  result: WorkforceResult;
  producedArtifactIds: ID[];
  unlockedTaskIds: ID[];
  reason: string;
}

/**
 * Accepts a worker result at the workforce boundary and translates successful
 * completion into downstream scheduling readiness. Artifact persistence remains
 * owned by the artifact layer; this object only carries artifact identities.
 */
export class WorkforceResultHandoff {
  constructor(
    private readonly registry: WorkforceRegistry,
    private readonly orchestrator: WorkforceOrchestrator,
  ) {}

  accept(result: WorkforceResult, artifacts: Artifact[] = []): WorkforceHandoff {
    const task = this.registry.getTask(result.taskId);
    if (!task) {
      return {
        taskId: result.taskId,
        status: "rejected",
        result,
        producedArtifactIds: [],
        unlockedTaskIds: [],
        reason: `Task "${result.taskId}" is not registered in the workforce registry.`,
      };
    }

    if (result.status !== "success") {
      return {
        taskId: result.taskId,
        status: "rejected",
        result,
        producedArtifactIds: [],
        unlockedTaskIds: [],
        reason: `Worker result for "${result.taskId}" is ${result.status} and cannot complete the task.`,
      };
    }

    this.orchestrator.complete(result.taskId);

    const producedArtifactIds = artifacts
      .filter((artifact) => artifact.taskId === result.taskId || result.artifactIds.includes(artifact.id))
      .map((artifact) => artifact.id);

    const missionId = task.missionId;
    const snapshot = this.orchestrator.snapshot(missionId);

    return {
      taskId: result.taskId,
      status: "accepted",
      result,
      producedArtifactIds,
      unlockedTaskIds: snapshot.runnableTaskIds,
      reason: `Verified worker result accepted for "${result.taskId}"; downstream runnable tasks were recalculated.`,
    };
  }
}
