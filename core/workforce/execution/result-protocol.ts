import type {
  ID,
  WorkforceResult,
} from "../types";

export interface ExternalExecutionResult {
  status: string;
  summary: string;
  reasoning?: string;
  artifactIds?: ID[];
  verificationReferences?: string[];
}

export interface WorkforceResultContext {
  taskId: ID;
  agentId: ID;
}

export function createWorkforceResult(
  context: WorkforceResultContext,
  external: ExternalExecutionResult,
): WorkforceResult {
  const status =
    external.status === "success"
      ? "success"
      : external.status === "partial"
        ? "partial"
        : "failure";

  return {
    id: `result-${context.taskId}`,
    taskId: context.taskId,
    agentId: context.agentId,
    status,
    summary: external.summary,
    artifactIds: external.artifactIds ?? [],
    reasoning: external.reasoning,
    verificationReferences:
      external.verificationReferences ?? [],
    createdAt: new Date().toISOString(),
  };
}
