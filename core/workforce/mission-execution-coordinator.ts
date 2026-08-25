import type { ID, Mission, Task, WorkforceResult } from "./types";
import { WorkforceRegistry } from "./registry";
import { WorkforceOrchestrator } from "./workforce-orchestrator";
import { WorkforceRoleDispatcher } from "./workforce-role-dispatcher";
import { WorkforceResultHandoff } from "./workforce-result-handoff";

export interface MissionExecutionCoordinatorOptions {
  registry: WorkforceRegistry;
  orchestrator?: WorkforceOrchestrator;
  dispatcher?: WorkforceRoleDispatcher;
  handoff?: WorkforceResultHandoff;
}

export interface MissionExecutionCoordinatorSnapshot {
  missionId: ID;
  runnableTaskIds: ID[];
  runningTaskIds: ID[];
  blockedTaskIds: ID[];
  completedTaskIds: ID[];
  dispatchableTaskIds: ID[];
}

export interface MissionExecutionDispatch {
  taskId: ID;
  agentId: ID;
  role: string;
  reason: string;
}

/**
 * Top-level coordinator for a single governed mission.
 *
 * It does not perform coding, web research, filesystem writes, or tool calls.
 * Those remain owned by specialized authorities. This coordinator only
 * advances the mission graph by selecting runnable work, assigning a
 * qualified worker, and accepting verified results back into the graph.
 */
export class MissionExecutionCoordinator {
  private readonly registry: WorkforceRegistry;
  private readonly orchestrator: WorkforceOrchestrator;
  private readonly dispatcher: WorkforceRoleDispatcher;
  private readonly handoff: WorkforceResultHandoff;

  constructor(options: MissionExecutionCoordinatorOptions) {
    this.registry = options.registry;
    this.orchestrator = options.orchestrator ?? new WorkforceOrchestrator(this.registry);
    this.dispatcher = options.dispatcher ?? new WorkforceRoleDispatcher(this.registry, this.orchestrator);
    this.handoff = options.handoff ?? new WorkforceResultHandoff(this.registry, this.orchestrator);
  }

  snapshot(missionId: ID): MissionExecutionCoordinatorSnapshot {
    const state = this.orchestrator.snapshot(missionId);
    const dispatchableTaskIds = state.runnableTaskIds.filter((taskId) => {
      const task = this.registry.getTask(taskId);
      if (!task) return false;
      return this.registry.listAgents().some((agent) =>
        agent.status === "available" &&
        task.requiredCapabilities.every((capability) => agent.capabilities.includes(capability)) &&
        task.requiredToolIds.every((toolId) => agent.toolIds.includes(toolId)),
      );
    });

    return {
      missionId,
      runnableTaskIds: [...state.runnableTaskIds],
      runningTaskIds: [...state.activeTaskIds],
      blockedTaskIds: [...state.blockedTaskIds],
      completedTaskIds: [...state.completedTaskIds],
      dispatchableTaskIds,
    };
  }

  dispatchNext(missionId: ID): MissionExecutionDispatch | undefined {
    const result = this.dispatcher.dispatchNext(missionId);
    if (!result?.assignment || result.dispatch.status !== "dispatched") {
      return undefined;
    }

    return {
      taskId: result.assignment.taskId,
      agentId: result.assignment.agentId,
      role: result.assignment.role,
      reason: result.assignment.reason,
    };
  }

  acceptVerifiedResult(result: WorkforceResult): ReturnType<WorkforceResultHandoff["accept"]> {
    return this.handoff.accept(result);
  }

  getTask(taskId: ID): Task | undefined {
    return this.registry.getTask(taskId);
  }

  getMission(missionId: ID): Mission | undefined {
    return this.registry.getMission(missionId);
  }
}
