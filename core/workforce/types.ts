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
