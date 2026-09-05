import { randomUUID } from "node:crypto";

import { AppAiRouterError } from "./app-ai-router";
import { MemoryContextAuthority } from "./memory-context-authority";
import { MemoryRelevance } from "./memory-relevance";
import type { MemoryReference, MemoryType, Task } from "./types";
import {
  ApprovedExternalResearchAuthorizer,
  ExternalResearchAdapter,
  ExternalResearchAuthorizationError,
  type ExternalResearchResult,
} from "./execution/external-research";
import { WebAccessAdapter, WebAccessPolicyError } from "./web-access";

const APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const MEMORY_TYPES = new Set<MemoryType>(["working", "episodic", "semantic", "procedural"]);
const MAX_MEMORY_CANDIDATES = 500;
const MAX_MEMORY_SELECTION = 50;

export interface AppBrainMemorySelectionRequest {
  appId: string;
  requestId?: string;
  taskId: string;
  missionId: string;
  query: string;
  inputReferences?: readonly string[];
  expectedOutputs?: readonly string[];
  memories: readonly MemoryReference[];
  limit?: number;
}

export interface AppBrainMemorySelectionResult {
  requestId: string;
  appId: string;
  taskId: string;
  missionId: string;
  inspectedCount: number;
  selected: Array<{
    memory: MemoryReference;
    score: number;
    reasons: string[];
  }>;
}

export interface AppBrainResearchRequest {
  appId: string;
  requestId?: string;
  taskId: string;
  question: string;
  urls: readonly string[];
  maxSources?: number;
}

export interface AppBrainResearchResult extends ExternalResearchResult {
  requestId: string;
  appId: string;
}

export class AppBrainGatewayError extends AppAiRouterError {
  constructor(code: string, message: string, statusCode = 400) {
    super(code, message, statusCode);
    this.name = "AppBrainGatewayError";
  }
}

function requireAppId(value: unknown): string {
  if (typeof value !== "string" || !APP_ID_PATTERN.test(value)) {
    throw new AppBrainGatewayError(
      "INVALID_APP_ID",
      "appId must be 2 to 64 lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  }
  return value;
}

function requireText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") {
    throw new AppBrainGatewayError(`INVALID_${name.toUpperCase()}`, `${name} must be text.`);
  }
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > max) {
    throw new AppBrainGatewayError(
      `INVALID_${name.toUpperCase()}`,
      `${name} must contain between 1 and ${max} characters.`,
    );
  }
  return clean;
}

function optionalTextList(value: unknown, name: string, maxItems = 64, maxLength = 1000): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new AppBrainGatewayError(`INVALID_${name.toUpperCase()}`, `${name} must be an array with at most ${maxItems} items.`);
  }
  return value.map((item) => requireText(item, name, maxLength));
}

function requirePositiveInteger(value: unknown, name: string, max: number): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > max) {
    throw new AppBrainGatewayError(
      `INVALID_${name.toUpperCase()}`,
      `${name} must be an integer between 1 and ${max}.`,
    );
  }
  return Number(value);
}

function cloneMemory(memory: MemoryReference): MemoryReference {
  return {
    ...memory,
    sourceReferences: [...memory.sourceReferences],
  };
}

function validateMemoryCandidate(value: unknown, contextAuthority: MemoryContextAuthority): MemoryReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppBrainGatewayError("INVALID_MEMORY", "Every memory candidate must be an object.");
  }
  const input = value as Partial<MemoryReference>;
  const id = requireText(input.id, "memory_id", 200);
  if (!MEMORY_TYPES.has(input.type as MemoryType)) {
    throw new AppBrainGatewayError("INVALID_MEMORY_TYPE", `Memory "${id}" has an unsupported type.`);
  }
  const summary = requireText(input.summary, "memory_summary", 10_000);
  if (!Array.isArray(input.sourceReferences) || input.sourceReferences.length < 1 || input.sourceReferences.length > 64) {
    throw new AppBrainGatewayError(
      "INVALID_MEMORY_PROVENANCE",
      `Memory "${id}" must contain between 1 and 64 provenance references.`,
    );
  }
  const sourceReferences = input.sourceReferences.map((source) => requireText(source, "memory_source", 1000));
  const createdAt = requireText(input.createdAt, "memory_created_at", 80);
  const updatedAt = requireText(input.updatedAt, "memory_updated_at", 80);
  if (typeof input.authoritative !== "boolean") {
    throw new AppBrainGatewayError("INVALID_MEMORY_AUTHORITY", `Memory "${id}" must declare authoritative state.`);
  }
  const memory: MemoryReference = {
    id,
    type: input.type as MemoryType,
    summary,
    sourceReferences,
    ...(input.missionId === undefined ? {} : { missionId: requireText(input.missionId, "memory_mission_id", 200) }),
    ...(input.taskId === undefined ? {} : { taskId: requireText(input.taskId, "memory_task_id", 200) }),
    ...(input.agentId === undefined ? {} : { agentId: requireText(input.agentId, "memory_agent_id", 200) }),
    ...(input.artifactId === undefined ? {} : { artifactId: requireText(input.artifactId, "memory_artifact_id", 200) }),
    authoritative: input.authoritative,
    createdAt,
    updatedAt,
  };
  try {
    contextAuthority.inspect(memory);
  } catch (error) {
    throw new AppBrainGatewayError(
      "INVALID_MEMORY_CONTEXT",
      error instanceof Error ? error.message : String(error),
    );
  }
  return memory;
}

function requestId(value: unknown): string {
  if (value === undefined || value === null || value === "") return randomUUID();
  return requireText(value, "request_id", 200);
}

export class AppBrainGateway {
  private readonly relevance = new MemoryRelevance();
  private readonly contextAuthority = new MemoryContextAuthority();

  constructor(
    private readonly webAccess: WebAccessAdapter,
    private readonly maxResearchSources = 8,
  ) {
    if (!Number.isInteger(maxResearchSources) || maxResearchSources < 1 || maxResearchSources > 50) {
      throw new Error("K.I.N.G.S. App Brain: maxResearchSources must be an integer between 1 and 50");
    }
  }

  selectMemory(input: AppBrainMemorySelectionRequest): AppBrainMemorySelectionResult {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new AppBrainGatewayError("INVALID_MEMORY_REQUEST", "Memory-selection request must be an object.");
    }
    const appId = requireAppId(input.appId);
    const resolvedRequestId = requestId(input.requestId);
    const taskId = requireText(input.taskId, "task_id", 200);
    const missionId = requireText(input.missionId, "mission_id", 200);
    const query = requireText(input.query, "query", 20_000);
    const inputReferences = optionalTextList(input.inputReferences, "input_references");
    const expectedOutputs = optionalTextList(input.expectedOutputs, "expected_outputs");
    if (!Array.isArray(input.memories) || input.memories.length > MAX_MEMORY_CANDIDATES) {
      throw new AppBrainGatewayError(
        "INVALID_MEMORIES",
        `memories must be an array with at most ${MAX_MEMORY_CANDIDATES} candidates.`,
      );
    }
    const limit = input.limit === undefined
      ? Math.min(8, Math.max(1, input.memories.length || 1))
      : requirePositiveInteger(input.limit, "memory_limit", MAX_MEMORY_SELECTION);
    const memories = input.memories.map((memory) => validateMemoryCandidate(memory, this.contextAuthority));
    const ids = new Set<string>();
    for (const memory of memories) {
      if (ids.has(memory.id)) {
        throw new AppBrainGatewayError("DUPLICATE_MEMORY_ID", `Duplicate memory id "${memory.id}" was supplied.`);
      }
      ids.add(memory.id);
    }
    const timestamp = new Date().toISOString();
    const task: Task = {
      id: taskId,
      missionId,
      name: `App memory selection for ${appId}`,
      description: query,
      requiredCapabilities: ["memory"],
      requiredToolIds: [],
      status: "ready",
      dependencyIds: [],
      inputReferences,
      expectedOutputs,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const selected = this.relevance.rank(task, memories, Math.min(limit, memories.length)).map((entry) => ({
      memory: cloneMemory(entry.memory),
      score: entry.score,
      reasons: [...entry.reasons],
    }));
    return {
      requestId: resolvedRequestId,
      appId,
      taskId,
      missionId,
      inspectedCount: memories.length,
      selected,
    };
  }

  async retrieveResearch(input: AppBrainResearchRequest): Promise<AppBrainResearchResult> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new AppBrainGatewayError("INVALID_RESEARCH_REQUEST", "Research request must be an object.");
    }
    const appId = requireAppId(input.appId);
    const resolvedRequestId = requestId(input.requestId);
    const taskId = requireText(input.taskId, "task_id", 200);
    const question = requireText(input.question, "research_question", 20_000);
    if (!Array.isArray(input.urls) || input.urls.length < 1) {
      throw new AppBrainGatewayError("INVALID_RESEARCH_URLS", "At least one research URL is required.");
    }
    const urls = input.urls.map((url) => requireText(url, "research_url", 4000));
    if (urls.length > this.maxResearchSources) {
      throw new AppBrainGatewayError(
        "TOO_MANY_RESEARCH_SOURCES",
        `At most ${this.maxResearchSources} research sources may be retrieved per request.`,
      );
    }
    const maxSources = input.maxSources === undefined
      ? this.maxResearchSources
      : requirePositiveInteger(input.maxSources, "max_sources", this.maxResearchSources);
    if (new Set(urls).size > maxSources) {
      throw new AppBrainGatewayError(
        "TOO_MANY_RESEARCH_SOURCES",
        `Unique research source count exceeds the request maximum of ${maxSources}.`,
      );
    }
    const research = new ExternalResearchAdapter(
      this.webAccess,
      new ApprovedExternalResearchAuthorizer(new Set([taskId])),
    );
    try {
      const result = await research.execute({
        requestId: resolvedRequestId,
        taskId,
        agentId: `app-brain:${appId}`,
        toolId: research.toolId,
        arguments: {
          researchId: resolvedRequestId,
          question,
          urls,
          maxSources,
        },
      });
      return {
        ...result,
        requestId: resolvedRequestId,
        appId,
      };
    } catch (error) {
      if (error instanceof ExternalResearchAuthorizationError || error instanceof WebAccessPolicyError) {
        throw new AppBrainGatewayError("RESEARCH_POLICY_REJECTED", error.message, 403);
      }
      throw new AppBrainGatewayError(
        "RESEARCH_RETRIEVAL_FAILED",
        error instanceof Error ? error.message : String(error),
        502,
      );
    }
  }
}
