import type { ID, Mission, Task, WorkforceResult } from "./types";
import { WorkforceRegistry } from "./registry";
import { WorkforceOrchestrator } from "./workforce-orchestrator";
import { WorkforceRoleDispatcher } from "./workforce-role-dispatcher";
import { WorkforceResultHandoffAuthority } from "./workforce-result-handoff";

export interface MissionExecutionCoordinatorOptions {
  registry: WorkforceRegistry;
  orchestrator?: WorkforceOrchestrator;
  dispatcher?: WorkforceRoleDispatcher;
  handoff?: WorkforceResultHandoffAuthority;
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
  private readonly handoff: WorkforceResultHandoffAuthority;

  constructor(options: MissionExecutionCoordinatorOptions) {
    this.registry = options.registry;
    this.orchestrator = options.orchestrator ?? new WorkforceOrchestrator(this.registry);
    this.dispatcher = options.dispatcher ?? new WorkforceRoleDispatcher(this.registry);
    this.handoff = options.handoff ?? new WorkforceResultHandoffAuthority(this.orchestrator);
  }

  snapshot(missionId: ID): MissionExecutionCoordinatorSnapshot {
    const state = this.orchestrator.snapshot(missionId);
    const dispatchableTaskIds = state.runnableTaskIds.filter((taskId) => this.hasQualifiedWorker(taskId));
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
    const snapshot = this.snapshot(missionId);
    const taskId = snapshot.dispatchableTaskIds[0];
    if (!taskId) return undefined;

    const assignment = this.dispatcher.assign(taskId);
    if (!assignment) return undefined;

    const dispatch = this.orchestrator.dispatchNext(missionId);
    if (!dispatch || dispatch.status !== "dispatched") {
      return undefined;
    }

    return {
      taskId,
      agentId: assignment.agentId,
      role: assignment.role,
      reason: `Task "${taskId}" dispatched to ${assignment.role} agent "${assignment.agentId}".` ,
    };
  }

  acceptVerifiedResult(result: WorkforceResult): Task[] {
    return this.handoff.accept(result);
  }

  getTask(taskId: ID): Task | undefined {
    return this.registry.getTask(taskId);
  }

  getMission(missionId: ID): Mission | undefined {
    return this.registry.getMission(missionId);
  }

  private hasQualifiedWorker(taskId: ID): boolean {
    return Boolean(this.dispatcher.findQualifiedAgent(taskId));
  }
}
