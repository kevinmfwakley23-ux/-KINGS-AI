import type {
  BudgetUsage,
} from "./budget-authority";

import type {
  ID,
} from "./types";

export type IntelligenceProviderKind =
  | "internal-local"
  | "internal-self-hosted"
  | "external-free"
  | "external-paid";

export type IntelligenceCapability =
  | "reasoning"
  | "planning"
  | "coding"
  | "debugging"
  | "research"
  | "web-learning"
  | "source-inspection"
  | "tool-use"
  | "structured-output"
  | "vision"
  | "audio"
  | "long-context"
  | "memory"
  | "verification"
  | "recovery";

export type IntelligenceModality =
  | "text"
  | "image"
  | "audio"
  | "video";

export type ModelRequestMessageRole =
  | "system"
  | "user"
  | "assistant"
  | "tool";

export interface ModelRequestMessage {
  role: ModelRequestMessageRole;
  content: string;
}

export interface ModelToolCallProposal {
  id: ID;
  toolId: ID;
  arguments: Record<string, unknown>;
}

export interface ModelExecutionRequest {
  id: ID;
  taskId: ID;
  missionId: ID;
  messages: readonly ModelRequestMessage[];
  requiredCapabilities: readonly IntelligenceCapability[];
  inputModalities: readonly IntelligenceModality[];
  outputModality: IntelligenceModality;
  maxOutputTokens?: number;
  temperature?: number;
  requireStructuredOutput?: boolean;
  allowToolProposals: boolean;
}

export interface ModelIdentity {
  providerId: ID;
  modelId: ID;
  displayName: string;
  providerKind: IntelligenceProviderKind;
  capabilities: readonly IntelligenceCapability[];
  inputModalities: readonly IntelligenceModality[];
  outputModalities: readonly IntelligenceModality[];
  contextWindowTokens: number;
  supportsToolCalling: boolean;
  supportsStructuredOutput: boolean;
  available: boolean;
}

export interface ModelExecutionUsage
  extends BudgetUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelExecutionMetadata {
  requestId: ID;
  providerRequestId?: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
}

export interface ModelExecutionResponse {
  requestId: ID;
  model: ModelIdentity;
  content: string;
  toolCallProposals: readonly ModelToolCallProposal[];
  usage: ModelExecutionUsage;
  metadata: ModelExecutionMetadata;
}

export interface ModelExecutionFailure {
  requestId: ID;
  providerId: ID;
  modelId: ID;
  retryable: boolean;
  code: string;
  message: string;
  metadata: ModelExecutionMetadata;
}

export interface ModelExecutionResult {
  success: boolean;
  response?: ModelExecutionResponse;
  failure?: ModelExecutionFailure;
}

export interface IntelligenceModel {
  readonly identity: ModelIdentity;

  canHandle(
    request: ModelExecutionRequest,
  ): boolean;

  execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult>;
}
