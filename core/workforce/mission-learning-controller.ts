import type { ID } from "./types";
import type { MissionState, MissionContinuityStore } from "./mission-continuity";
import type { CapabilityLearningBlocker } from "./capability-learning-bridge";
import { CapabilityLearningBridge } from "./capability-learning-bridge";

export interface MissionLearningRecord {
  id: ID;
  missionId: ID;
  taskId: ID;
  status: "blocked" | "research-requested" | "ready-to-resume" | "resumed";
  blocker: CapabilityLearningBlocker;
  createdAt: string;
  updatedAt: string;
  resumedAt?: string;
}

export interface MissionLearningSnapshot {
  missionId: ID;
  records: MissionLearningRecord[];
  resumableTaskIds: ID[];
}

/**
 * Owns the mission-facing lifecycle for capability-driven learning.
 * It does not grant research or execution authority; it persists the
 * blocker and makes the original task resumable after a verified capability.
 */
export class MissionLearningController {
  private readonly records = new Map<ID, MissionLearningRecord>();

  constructor(
    private readonly continuity: MissionContinuityStore,
    private readonly bridge: CapabilityLearningBridge = new CapabilityLearningBridge(),
  ) {}

  blockTask(input: Parameters<CapabilityLearningBridge["createBlocker"]>[0]): MissionLearningRecord {
    const blocker = this.bridge.createBlocker(input);
    const now = new Date().toISOString();
    const record: MissionLearningRecord = {
      id: `learning-${input.taskId}-${Date.now()}`,
      missionId: input.missionId,
      taskId: input.taskId,
      status: "blocked",
      blocker,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(record.id, record);

    const current = this.requireState(input.missionId);
    const state = this.continuity.updateState(input.missionId, {
      activeTaskIds: current.activeTaskIds.filter((id) => id !== input.taskId),
      blockedTaskIds: current.blockedTaskIds.includes(input.taskId)
        ? current.blockedTaskIds
        : [...current.blockedTaskIds, input.taskId],
      failedTaskIds: current.failedTaskIds.filter((id) => id !== input.taskId),
    });

    const plan = this.continuity.getPlan(input.missionId);
    if (!plan) throw new Error(`K.I.N.G.S. Mission Learning: mission "${input.missionId}" has no plan`);

    this.continuity.createCheckpoint({
      id: `checkpoint-learning-${record.taskId}-${Date.now()}`,
      missionId: input.missionId,
      planId: plan.id,
      planVersion: plan.version,
      state,
      summary: `Task "${input.taskId}" is blocked pending verified capability learning.`,
      reason: blocker.reason,
      createdAt: now,
    });

    return cloneRecord(record);
  }

  markResearchRequested(recordId: ID): MissionLearningRecord {
    return this.updateRecord(recordId, "research-requested");
  }

  markReadyToResume(recordId: ID): MissionLearningRecord {
    const record = this.requireRecord(recordId);
    const current = this.requireState(record.missionId);
    this.continuity.updateState(record.missionId, {
      blockedTaskIds: current.blockedTaskIds.filter((id) => id !== record.taskId),
    });
    return this.updateRecord(recordId, "ready-to-resume");
  }

  resume(recordId: ID): MissionLearningRecord {
    const record = this.requireRecord(recordId);
    if (record.status !== "ready-to-resume") {
      throw new Error(`K.I.N.G.S. Mission Learning: record "${recordId}" is not ready to resume`);
    }

    const current = this.requireState(record.missionId);
    this.continuity.updateState(record.missionId, {
      activeTaskIds: current.activeTaskIds.includes(record.taskId)
        ? current.activeTaskIds
        : [...current.activeTaskIds, record.taskId],
      blockedTaskIds: current.blockedTaskIds.filter((id) => id !== record.taskId),
      failedTaskIds: current.failedTaskIds.filter((id) => id !== record.taskId),
    });

    const updated = {
      ...record,
      status: "resumed" as const,
      resumedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.records.set(recordId, updated);
    return cloneRecord(updated);
  }

  get(recordId: ID): MissionLearningRecord | undefined {
    const record = this.records.get(recordId);
    return record ? cloneRecord(record) : undefined;
  }

  snapshot(missionId: ID): MissionLearningSnapshot {
    const records = [...this.records.values()]
      .filter((record) => record.missionId === missionId)
      .map(cloneRecord);

    return {
      missionId,
      records,
      resumableTaskIds: records
        .filter((record) => record.status === "ready-to-resume")
        .map((record) => record.taskId),
    };
  }

  private updateRecord(recordId: ID, status: MissionLearningRecord["status"]): MissionLearningRecord {
    const record = this.requireRecord(recordId);
    const updated = { ...record, status, updatedAt: new Date().toISOString() };
    this.records.set(recordId, updated);
    return cloneRecord(updated);
  }

  private requireRecord(recordId: ID): MissionLearningRecord {
    const record = this.records.get(recordId);
    if (!record) throw new Error(`K.I.N.G.S. Mission Learning: record "${recordId}" not found`);
    return record;
  }

  private requireState(missionId: ID): MissionState {
    const state = this.continuity.getState(missionId);
    if (!state) throw new Error(`K.I.N.G.S. Mission Learning: mission "${missionId}" has no state`);
    return state;
  }
}

function cloneRecord(record: MissionLearningRecord): MissionLearningRecord {
  return {
    ...record,
    blocker: {
      ...record.blocker,
      operations: [...record.blocker.operations],
      missingExecutables: [...record.blocker.missingExecutables],
      missingOperations: [...record.blocker.missingOperations],
      researchRequest: {
        ...record.blocker.researchRequest,
        requestedHosts: record.blocker.researchRequest.requestedHosts
          ? [...record.blocker.researchRequest.requestedHosts]
          : undefined,
        requestedSourceTypes: record.blocker.researchRequest.requestedSourceTypes
          ? [...record.blocker.researchRequest.requestedSourceTypes]
          : undefined,
      },
    },
  };
}
