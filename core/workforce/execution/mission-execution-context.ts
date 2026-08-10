import type {
  ID,
  MemoryReference,
  MemoryResult,
  Task,
} from "../types";

import type {
  AgentDefinition,
} from "../types";

export interface MissionExecutionContext {
  missionId: ID;
  taskId: ID;

  agent: AgentDefinition;
  task: Task;

  /**
   * Relevant durable mission memory selected for this task.
   *
   * This is read-only execution context.
   * It does not grant mutation or authority.
   */
  memories: MemoryReference[];

  /**
   * Authoritative Project Brain knowledge retrieved
   * for this task.
   *
   * This is read-only execution context.
   */
  knowledge?: MemoryResult;
}

export function createMissionExecutionContext(
  context: MissionExecutionContext,
): MissionExecutionContext {
  if (!context.missionId) {
    throw new Error(
      "K.I.N.G.S. Mission Execution Context: mission id is required",
    );
  }

  if (!context.taskId) {
    throw new Error(
      "K.I.N.G.S. Mission Execution Context: task id is required",
    );
  }

  if (
    context.task.missionId !==
    context.missionId
  ) {
    throw new Error(
      "K.I.N.G.S. Mission Execution Context: task mission does not match context mission",
    );
  }

  if (
    context.task.id !==
    context.taskId
  ) {
    throw new Error(
      "K.I.N.G.S. Mission Execution Context: task id does not match context task",
    );
  }

  return {
    ...context,
    memories: [
      ...context.memories,
    ],
    knowledge:
      context.knowledge
        ? {
            ...context.knowledge,
            records: [
              ...context.knowledge.records,
            ],
            evidence: [
              ...context.knowledge.evidence,
            ],
            sourceIds: [
              ...context.knowledge.sourceIds,
            ],
          }
        : undefined,
  };
}
