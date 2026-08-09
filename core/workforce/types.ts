/**
 * K.I.N.G.S. Workforce Kernel
 *
 * Framework-independent vocabulary for the K.I.N.G.S. AI workforce.
 *
 * IMPORTANT:
 * This layer defines the K.I.N.G.S. architecture.
 * External agent frameworks such as CrewAI, BeeAI, Letta,
 * Hatchet, Continue, or future systems must adapt to this layer
 * rather than becoming the architectural authority.
 */

export type ID = string;

export type MissionStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type ResultStatus =
  | "success"
  | "partial"
  | "failure"
  | "rejected";

export type AgentStatus =
  | "available"
  | "busy"
  | "paused"
  | "disabled";

export type ArtifactType =
  | "code"
  | "document"
  | "research"
  | "decision"
  | "configuration"
  | "test"
  | "report"
  | "other";

export type MemoryType =
  | "working"
  | "episodic"
  | "semantic"
  | "procedural";

export interface Mission {
  id: ID;
  name: string;
  description: string;
  status: MissionStatus;

  /**
   * Human-approved objectives the workforce is expected to satisfy.
   */
  objectives: string[];

  /**
   * References to authoritative project documents.
   */
  sourceReferences: string[];

  createdAt: string;
  updatedAt: string;
}

export interface AgentDefinition {
  id: ID;
  name: string;
  role: string;
  description: string;

  /**
   * Capabilities describe what the agent is allowed and expected
   * to do. They do not grant unrestricted authority.
   */
  capabilities: string[];

  /**
   * Explicit tool identifiers available to the agent.
   */
  toolIds: ID[];

  status: AgentStatus;
}

export interface Task {
  id: ID;
  missionId: ID;
  name: string;
  description: string;

  assignedAgentId?: ID;

  /**
   * Capabilities the assigned agent must possess
   * before this task may execute.
   */
  requiredCapabilities: string[];

  /**
   * Specific tools the assigned agent must be authorized
   * to use before this task may execute.
   */
  requiredToolIds: ID[];

  status: TaskStatus;

  /**
   * Tasks may depend on other tasks completing first.
   */
  dependencyIds: ID[];

  /**
   * Documents, files, decisions, or other context required
   * before execution.
   */
  inputReferences: string[];

  /**
   * Expected deliverables.
   */
  expectedOutputs: string[];

  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: ID;
  missionId: ID;
  name: string;
  description: string;

  taskIds: ID[];

  /**
   * Whether the workflow requires an explicit approval gate
   * before execution or promotion.
   */
  requiresApproval: boolean;
}

export interface ToolDefinition {
  id: ID;
  name: string;
  description: string;

  /**
   * Tool capabilities are descriptive at the kernel level.
   * Actual execution belongs to a tool adapter.
   */
  capabilities: string[];

  enabled: boolean;
}

export interface Artifact {
  id: ID;
  type: ArtifactType;

  name: string;
  description: string;

  /**
   * Physical or logical location of the artifact.
   */
  location?: string;

  /**
   * Hash/version information can later be used for
   * provenance and reproducibility.
   */
  version?: string;
  contentHash?: string;

  createdByAgentId?: ID;
  taskId?: ID;
  missionId?: ID;

  createdAt: string;
}

export interface WorkforceResult {
  id: ID;
  taskId: ID;
  agentId: ID;

  status: ResultStatus;

  summary: string;

  artifactIds: ID[];

  /**
   * Human-readable explanation of what happened.
   */
  reasoning?: string;

  /**
   * References to tests, validation reports, logs,
   * or other verification evidence.
   */
  verificationReferences: string[];

  createdAt: string;
}

export type KnowledgeSourceType =
  | "construction-document"
  | "blueprint"
  | "project-ledger"
  | "implementation-matrix"
  | "repository"
  | "decision"
  | "other";

export interface KnowledgeSource {
  id: ID;
  type: KnowledgeSourceType;

  name: string;
  description: string;

  /**
   * Physical or logical location of the authoritative source.
   */
  location: string;

  /**
   * Indicates whether this source is authoritative for project decisions.
   */
  authoritative: boolean;

  version?: string;
  contentHash?: string;

  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRecord {
  id: ID;

  /**
   * Source from which this knowledge was derived.
   */
  sourceId: ID;

  /**
   * Short retrievable statement of project knowledge.
   */
  summary: string;

  /**
   * Optional structured content retained for retrieval or inspection.
   */
  content?: string;

  /**
   * Evidence references supporting this record.
   */
  evidenceIds: ID[];

  /**
   * Indicates whether this record has been explicitly
   * promoted as authoritative project knowledge.
   */
  authoritative: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: ID;

  /**
   * Knowledge source supporting this evidence.
   */
  sourceId: ID;

  /**
   * Human-readable description of what the evidence establishes.
   */
  description: string;

  /**
   * Location within the source, such as a file path,
   * section, page, heading, or line range.
   */
  location?: string;

  /**
   * Optional excerpt retained for verification.
   */
  excerpt?: string;

  createdAt: string;
}

export interface MemoryQuery {
  /**
   * Human-readable retrieval request.
   */
  query: string;

  /**
   * Optional filters limiting retrieval to specific sources.
   */
  sourceIds?: ID[];

  /**
   * Optional filters limiting retrieval to specific memory types.
   */
  memoryTypes?: MemoryType[];

  /**
   * Whether authoritative knowledge should be preferred.
   */
  authoritativeOnly?: boolean;

  /**
   * Maximum number of records requested.
   */
  limit?: number;
}

export interface MemoryResult {
  query: string;

  /**
   * Knowledge records returned by retrieval.
   */
  records: KnowledgeRecord[];

  /**
   * Evidence supporting the returned knowledge.
   */
  evidence: Evidence[];

  /**
   * References to the original sources consulted.
   */
  sourceIds: ID[];

  createdAt: string;
}

export interface MemoryReference {
  id: ID;
  type: MemoryType;

  /**
   * Short human-readable statement of what is remembered.
   */
  summary: string;

  /**
   * Source/provenance references.
   */
  sourceReferences: string[];

  /**
   * Related mission, task, agent, or artifact.
   */
  missionId?: ID;
  taskId?: ID;
  agentId?: ID;
  artifactId?: ID;

  /**
   * Indicates whether this memory has been explicitly
   * promoted to an authoritative project decision.
   */
  authoritative: boolean;

  createdAt: string;
  updatedAt: string;
}
