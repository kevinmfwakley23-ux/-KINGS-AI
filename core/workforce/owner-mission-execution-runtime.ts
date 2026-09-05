import type { WorkforceResult } from "./types";
import type { ProductBuildWorkerRunner } from "./product-build-worker-runner";
import {
  OwnerMissionRuntime,
  type OwnerMissionSnapshot,
} from "./owner-mission-runtime";

export interface OwnerMissionExecutionStepResult {
  missionId: string;
  dispatchedTaskId?: string;
  completedTaskId?: string;
  failedTaskId?: string;
  workforceResult?: WorkforceResult;
  snapshot: OwnerMissionSnapshot;
}

export interface OwnerMissionExecutionRunResult {
  missionId: string;
  steps: OwnerMissionExecutionStepResult[];
  snapshot: OwnerMissionSnapshot;
  stoppedBecause: "completed" | "failed" | "blocked" | "limit";
}

/**
 * Executes the already-persisted owner mission graph through the canonical
 * ProductBuildWorkerRunner boundary. Dispatch is persisted before the worker
 * starts and completion/failure is persisted with its attributable result.
 */
export class OwnerMissionExecutionRuntime {
  constructor(
    private readonly missions: OwnerMissionRuntime,
    private readonly runner: ProductBuildWorkerRunner,
  ) {}

  async runNext(missionId: string): Promise<OwnerMissionExecutionStepResult> {
    const before = this.missions.snapshot(missionId);
    if (before.mission.status === "completed" || before.mission.status === "failed") {
      return { missionId, snapshot: before };
    }

    const dispatch = await this.missions.dispatchNext(missionId);
    if (!dispatch) {
      return { missionId, snapshot: this.missions.snapshot(missionId) };
    }

    try {
      const worker = await this.runner.run({ dispatch });
      const result = worker.result;
      if (
        !worker.completed ||
        !result ||
        result.status === "failure" ||
        result.status === "rejected"
      ) {
        const failure = result ?? failureResult(
          dispatch.taskId,
          dispatch.agentId,
          "Worker returned without verifiable completion evidence.",
        );
        await this.missions.failTask(dispatch.taskId, failure);
        return {
          missionId,
          dispatchedTaskId: dispatch.taskId,
          failedTaskId: dispatch.taskId,
          workforceResult: failure,
          snapshot: this.missions.snapshot(missionId),
        };
      }

      await this.missions.completeTask(dispatch.taskId, result);
      return {
        missionId,
        dispatchedTaskId: dispatch.taskId,
        completedTaskId: dispatch.taskId,
        workforceResult: result,
        snapshot: this.missions.snapshot(missionId),
      };
    } catch (error) {
      const failure = failureResult(
        dispatch.taskId,
        dispatch.agentId,
        error instanceof Error ? error.message : String(error),
      );
      await this.missions.failTask(dispatch.taskId, failure);
      return {
        missionId,
        dispatchedTaskId: dispatch.taskId,
        failedTaskId: dispatch.taskId,
        workforceResult: failure,
        snapshot: this.missions.snapshot(missionId),
      };
    }
  }

  async run(
    missionId: string,
    maximumTasks = 32,
  ): Promise<OwnerMissionExecutionRunResult> {
    if (!Number.isInteger(maximumTasks) || maximumTasks < 1 || maximumTasks > 256) {
      throw new Error("K.I.N.G.S. Owner Mission Execution: maximumTasks must be an integer from 1 to 256.");
    }

    const steps: OwnerMissionExecutionStepResult[] = [];
    for (let index = 0; index < maximumTasks; index += 1) {
      const before = this.missions.snapshot(missionId);
      if (before.mission.status === "completed") {
        return { missionId, steps, snapshot: before, stoppedBecause: "completed" };
      }
      if (before.mission.status === "failed") {
        return { missionId, steps, snapshot: before, stoppedBecause: "failed" };
      }

      const step = await this.runNext(missionId);
      steps.push(step);
      if (step.failedTaskId) {
        return { missionId, steps, snapshot: step.snapshot, stoppedBecause: "failed" };
      }
      if (step.snapshot.mission.status === "completed") {
        return { missionId, steps, snapshot: step.snapshot, stoppedBecause: "completed" };
      }
      if (!step.dispatchedTaskId) {
        return { missionId, steps, snapshot: step.snapshot, stoppedBecause: "blocked" };
      }
    }

    return {
      missionId,
      steps,
      snapshot: this.missions.snapshot(missionId),
      stoppedBecause: "limit",
    };
  }
}

function failureResult(taskId: string, agentId: string, message: string): WorkforceResult {
  return {
    id: `owner-result-${taskId}-${Date.now()}`,
    taskId,
    agentId,
    status: "failure",
    summary: message,
    artifactIds: [],
    verificationReferences: ["owner-mission-execution-failure"],
    createdAt: new Date().toISOString(),
  };
}
