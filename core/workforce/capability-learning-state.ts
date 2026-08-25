import type { ID } from "./types";

import type { CapabilityLearningBlocker } from "./capability-learning-bridge";

export type CapabilityLearningStatus =
  | "blocked"
  | "research-approved"
  | "research-complete"
  | "capability-verified"
  | "ready-to-resume";

export interface CapabilityLearningState {
  id: ID;
  missionId: ID;
  taskId: ID;
  capabilityId: ID;
  researchRequestId: ID;
  status: CapabilityLearningStatus;
  blocker: CapabilityLearningBlocker;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Durable state for a coding task that must learn a missing capability
 * before it can safely resume. This state contains no authority to browse,
 * install, or execute anything by itself.
 */
export class CapabilityLearningStateAuthority {
  create(blocker: CapabilityLearningBlocker, now = new Date().toISOString()): CapabilityLearningState {
    return {
      id: `learning-state-${blocker.taskId}`,
      missionId: blocker.missionId,
      taskId: blocker.taskId,
      capabilityId: blocker.capabilityId,
      researchRequestId: blocker.researchRequest.id,
      status: "blocked",
      blocker,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  markResearchApproved(state: CapabilityLearningState, now = new Date().toISOString()): CapabilityLearningState {
    return { ...state, status: "research-approved", updatedAt: now };
  }

  markResearchComplete(state: CapabilityLearningState, now = new Date().toISOString()): CapabilityLearningState {
    return { ...state, status: "research-complete", updatedAt: now };
  }

  markCapabilityVerified(state: CapabilityLearningState, now = new Date().toISOString()): CapabilityLearningState {
    return { ...state, status: "capability-verified", updatedAt: now };
  }

  readyToResume(state: CapabilityLearningState, now = new Date().toISOString()): CapabilityLearningState {
    if (state.status !== "capability-verified") {
      throw new Error("K.I.N.G.S. Capability Learning State: capability must be verified before resume readiness");
    }

    return { ...state, status: "ready-to-resume", updatedAt: now };
  }

  recordRetry(state: CapabilityLearningState, now = new Date().toISOString()): CapabilityLearningState {
    if (state.status !== "ready-to-resume") {
      throw new Error("K.I.N.G.S. Capability Learning State: task is not ready to resume");
    }

    return {
      ...state,
      retryCount: state.retryCount + 1,
      updatedAt: now,
    };
  }
}
