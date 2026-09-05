import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  AgentDefinition,
  Mission,
  Task,
  WorkforceResult,
} from "./types";
import {
  MissionContinuityStore,
  type MissionPlan,
} from "./mission-continuity";
import {
  MissionExecutionCoordinator,
  type MissionExecutionCoordinatorSnapshot,
  type MissionExecutionDispatch,
} from "./mission-execution-coordinator";
import { ProductBuildMissionAssembler } from "./product-build-mission-assembler";
import { WorkforceRegistry } from "./registry";

const STORE_VERSION = 1;
const DEFAULT_MAX_VISION_CHARS = 200_000;
const DEFAULT_MAX_CONTEXT_CHARS = 1_000_000;

export interface OwnerMissionContextDocument {
  id: string;
  name: string;
  mediaType: string;
  sha256: string;
  text: string;
}

export interface OwnerMissionCreateRequest {
  ownerVision: string;
  productName?: string;
  contextDocuments?: readonly OwnerMissionContextDocument[];
}

export interface OwnerMissionRecord {
  mission: Mission;
  plan: MissionPlan;
  tasks: Task[];
  ownerVision: string;
  contextDocuments: OwnerMissionContextDocument[];
  results?: WorkforceResult[];
  createdAt: string;
  updatedAt: string;
}

export interface OwnerMissionSnapshot {
  mission: Mission;
  plan: MissionPlan;
  tasks: Task[];
  results: WorkforceResult[];
  execution: MissionExecutionCoordinatorSnapshot;
  contextDocuments: Array<
    Omit<OwnerMissionContextDocument, "text"> & { characterCount: number }
  >;
}

interface OwnerMissionStoreFile {
  version: number;
  records: OwnerMissionRecord[];
}

/**
 * Production owner-facing mission boundary.
 *
 * Build From This Vision is explicit human approval for the exact submitted
 * vision. The existing ProductBuildMissionAssembler creates the canonical task
 * graph. This runtime owns durable task transitions as well as creation so no
 * executor can advance an owner mission only in memory and lose that state on
 * process restart.
 */
export class OwnerMissionRuntime {
  private readonly registry = new WorkforceRegistry();
  private readonly continuity = new MissionContinuityStore();
  private readonly coordinator = new MissionExecutionCoordinator({ registry: this.registry });
  private readonly assembler = new ProductBuildMissionAssembler(this.registry);
  private readonly records = new Map<string, OwnerMissionRecord>();
  private initialized = false;

  constructor(private readonly storePath: string) {
    if (!String(storePath ?? "").trim()) {
      throw new Error("K.I.N.G.S. Owner Mission Runtime: store path is required.");
    }
    for (const agent of ownerSystemAgents()) this.registry.registerAgent(agent);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    let parsed: OwnerMissionStoreFile | undefined;
    try {
      const raw = await readFile(resolve(this.storePath), "utf8");
      parsed = JSON.parse(raw) as OwnerMissionStoreFile;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
      throw new Error(
        `K.I.N.G.S. Owner Mission Runtime: failed to load persistent state: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.records)) {
      throw new Error("K.I.N.G.S. Owner Mission Runtime: persistent state has an unsupported schema.");
    }
    for (const record of parsed.records) this.restoreRecord(record);
  }

  async createMission(request: OwnerMissionCreateRequest): Promise<OwnerMissionSnapshot> {
    this.requireInitialized();
    const ownerVision = requiredText(request.ownerVision, "owner vision", DEFAULT_MAX_VISION_CHARS);
    const contextDocuments = normalizeContextDocuments(request.contextDocuments ?? []);
    const productName = normalizeProductName(request.productName, ownerVision);
    const missionId = `owner-mission-${randomUUID()}`;
    const now = new Date().toISOString();
    const sourceReferences = [
      "owner-vision",
      ...contextDocuments.map((document) => `owner-context:${document.id}:${document.sha256}`),
    ];

    const mission: Mission = {
      id: missionId,
      name: productName,
      description: ownerVision,
      status: "active",
      objectives: [ownerVision],
      sourceReferences,
      createdAt: now,
      updatedAt: now,
    };
    const plan: MissionPlan = {
      id: `plan-${missionId}-v1`,
      missionId,
      version: 1,
      objective: ownerVision,
      milestones: [],
      decisionIds: [],
      acceptanceCriteria: [
        "The submitted owner vision is represented in the executable task graph.",
        "Required implementation work is buildable and testable through governed K.I.N.G.S. engineering authority.",
        "Mission completion requires verification evidence rather than status text alone.",
      ],
      locked: true,
      approvedByHuman: true,
      createdAt: now,
      updatedAt: now,
    };

    this.continuity.registerMission(mission);
    this.continuity.registerPlan(plan);
    this.registry.registerMission(mission);
    const planningVision = combineVisionAndContext(ownerVision, contextDocuments);
    const assembly = this.assembler.assemble({ mission, plan, ownerVision: planningVision });

    for (const task of assembly.tasks) {
      task.inputReferences = uniqueStrings([...sourceReferences, ...task.inputReferences]);
    }

    const record: OwnerMissionRecord = {
      mission: clone(mission),
      plan: clone(plan),
      tasks: assembly.tasks.map(clone),
      ownerVision,
      contextDocuments: contextDocuments.map(clone),
      results: [],
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(missionId, record);

    try {
      await this.persist();
    } catch (error) {
      this.records.delete(missionId);
      throw error;
    }
    return this.snapshot(missionId);
  }

  list(): OwnerMissionSnapshot[] {
    this.requireInitialized();
    return [...this.records.keys()].sort().map((missionId) => this.snapshot(missionId));
  }

  snapshot(missionId: string): OwnerMissionSnapshot {
    this.requireInitialized();
    const record = this.requireRecord(missionId);
    return {
      mission: clone(record.mission),
      plan: clone(record.plan),
      tasks: record.tasks.map(clone),
      results: (record.results ?? []).map(clone),
      execution: this.coordinator.snapshot(missionId),
      contextDocuments: record.contextDocuments.map((document) => ({
        id: document.id,
        name: document.name,
        mediaType: document.mediaType,
        sha256: document.sha256,
        characterCount: document.text.length,
      })),
    };
  }

  getTask(taskId: string): Task | undefined {
    this.requireInitialized();
    const task = this.registry.getTask(taskId);
    return task ? clone(task) : undefined;
  }

  getMissionContext(missionId: string): {
    ownerVision: string;
    contextDocuments: OwnerMissionContextDocument[];
  } {
    this.requireInitialized();
    const record = this.requireRecord(missionId);
    return {
      ownerVision: record.ownerVision,
      contextDocuments: record.contextDocuments.map(clone),
    };
  }

  /** Dispatch is persisted before execution begins. */
  async dispatchNext(missionId: string): Promise<MissionExecutionDispatch | undefined> {
    this.requireInitialized();
    this.requireRecord(missionId);
    const dispatch = this.coordinator.dispatchNext(missionId);
    if (!dispatch) return undefined;
    this.syncRecord(missionId);
    await this.persist();
    return clone(dispatch);
  }

  /** Completion and the attributable workforce result cross one durable boundary. */
  async completeTask(taskId: string, result?: WorkforceResult): Promise<Task> {
    this.requireInitialized();
    const current = this.requireTask(taskId);
    if (result) this.validateResult(current, result);
    const completed = this.coordinator.completeTask(taskId);
    const record = this.requireRecord(completed.missionId);
    if (result) (record.results ??= []).push(clone(result));
    this.syncRecord(completed.missionId);
    await this.persist();
    return clone(completed);
  }

  async failTask(taskId: string, result?: WorkforceResult): Promise<Task> {
    this.requireInitialized();
    const current = this.requireTask(taskId);
    if (result) this.validateResult(current, result);
    const failed = this.coordinator.failTask(taskId);
    const record = this.requireRecord(failed.missionId);
    if (result) (record.results ??= []).push(clone(result));
    this.syncRecord(failed.missionId);
    await this.persist();
    return clone(failed);
  }

  /** Explicit retry keeps failed work recoverable without inventing a new task. */
  async retryTask(taskId: string): Promise<Task> {
    this.requireInitialized();
    const task = this.requireTask(taskId);
    if (task.status !== "failed") {
      throw new Error(`K.I.N.G.S. Owner Mission Runtime: task "${taskId}" is not failed.`);
    }
    task.status = "ready";
    delete task.assignedAgentId;
    task.updatedAt = new Date().toISOString();
    const mission = this.registry.getMission(task.missionId);
    if (mission) {
      mission.status = "active";
      mission.updatedAt = task.updatedAt;
    }
    this.syncRecord(task.missionId);
    await this.persist();
    return clone(task);
  }

  private restoreRecord(record: OwnerMissionRecord): void {
    validatePersistedRecord(record);
    const missionId = record.mission.id;
    if (this.records.has(missionId)) {
      throw new Error(`K.I.N.G.S. Owner Mission Runtime: duplicate persisted mission "${missionId}".`);
    }
    this.registry.registerMission(clone(record.mission));
    this.continuity.registerMission(clone(record.mission));
    this.continuity.registerPlan(clone(record.plan));
    for (const task of record.tasks) this.registry.registerTask(clone(task));
    this.records.set(missionId, { ...clone(record), results: (record.results ?? []).map(clone) });
  }

  private syncRecord(missionId: string): void {
    const record = this.requireRecord(missionId);
    const now = new Date().toISOString();
    const tasks = this.registry.listTasks().filter((task) => task.missionId === missionId);
    const registryMission = this.registry.getMission(missionId);
    if (!registryMission) {
      throw new Error(`K.I.N.G.S. Owner Mission Runtime: mission "${missionId}" is not registered.`);
    }
    if (tasks.length > 0 && tasks.every((task) => task.status === "completed")) {
      registryMission.status = "completed";
      registryMission.updatedAt = now;
    } else if (tasks.some((task) => task.status === "failed")) {
      registryMission.status = "failed";
      registryMission.updatedAt = now;
    } else if (registryMission.status !== "active") {
      registryMission.status = "active";
      registryMission.updatedAt = now;
    }
    record.mission = clone(registryMission);
    record.tasks = tasks.map(clone);
    record.updatedAt = now;
  }

  private validateResult(task: Task, result: WorkforceResult): void {
    if (result.taskId !== task.id) {
      throw new Error("K.I.N.G.S. Owner Mission Runtime: workforce result task identity mismatch.");
    }
    if (task.assignedAgentId && result.agentId !== task.assignedAgentId) {
      throw new Error("K.I.N.G.S. Owner Mission Runtime: workforce result agent identity mismatch.");
    }
  }

  private requireTask(taskId: string): Task {
    const task = this.registry.getTask(taskId);
    if (!task) throw new Error(`K.I.N.G.S. Owner Mission Runtime: task "${taskId}" was not found.`);
    return task;
  }

  private requireRecord(missionId: string): OwnerMissionRecord {
    const record = this.records.get(missionId);
    if (!record) throw new Error(`K.I.N.G.S. Owner Mission Runtime: mission "${missionId}" was not found.`);
    return record;
  }

  private async persist(): Promise<void> {
    const path = resolve(this.storePath);
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const payload: OwnerMissionStoreFile = {
      version: STORE_VERSION,
      records: [...this.records.values()]
        .sort((left, right) => left.mission.id.localeCompare(right.mission.id))
        .map(clone),
    };
    await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new Error("K.I.N.G.S. Owner Mission Runtime: initialize() must complete before use.");
    }
  }
}

function ownerSystemAgents(): AgentDefinition[] {
  return [
    {
      id: "kings-owner-architect",
      name: "K.I.N.G.S. Architecture Worker",
      role: "architecture",
      description: "Plans owner-approved software missions through the governed K.I.N.G.S. brain.",
      capabilities: ["architecture", "planning", "reasoning"],
      toolIds: [],
      status: "available",
    },
    {
      id: "kings-owner-researcher",
      name: "K.I.N.G.S. Research Worker",
      role: "research",
      description: "Researches requirements and constraints with governed source/evidence boundaries.",
      capabilities: ["research", "reasoning", "source-inspection"],
      toolIds: [],
      status: "available",
    },
    {
      id: "kings-owner-engineer",
      name: "K.I.N.G.S. Engineering Worker",
      role: "engineering",
      description: "Performs governed repository coding, integration, hardening and release work.",
      capabilities: ["coding", "debugging", "verification", "recovery"],
      toolIds: [],
      status: "available",
    },
    {
      id: "kings-owner-verifier",
      name: "K.I.N.G.S. Verification Worker",
      role: "testing",
      description: "Runs repository-native verification and preserves evidence before completion.",
      capabilities: ["testing", "verification"],
      toolIds: [],
      status: "available",
    },
  ];
}

function combineVisionAndContext(
  ownerVision: string,
  documents: readonly OwnerMissionContextDocument[],
): string {
  if (!documents.length) return ownerVision;
  return [
    ownerVision,
    "",
    "AUTHORITATIVE OWNER-SUPPLIED PROJECT CONTEXT:",
    ...documents.flatMap((document) => [
      `--- ${document.name} [${document.id}] sha256=${document.sha256} ---`,
      document.text,
    ]),
  ].join("\n");
}

function normalizeContextDocuments(
  documents: readonly OwnerMissionContextDocument[],
): OwnerMissionContextDocument[] {
  if (!Array.isArray(documents)) {
    throw new Error("K.I.N.G.S. Owner Mission Runtime: context documents must be an array.");
  }
  if (documents.length > 32) {
    throw new Error("K.I.N.G.S. Owner Mission Runtime: at most 32 context documents may be attached to one mission.");
  }
  const ids = new Set<string>();
  let totalCharacters = 0;
  return documents.map((value) => {
    const id = requiredText(value.id, "context document id", 256);
    if (!/^[A-Za-z0-9._-]+$/u.test(id)) {
      throw new Error(`K.I.N.G.S. Owner Mission Runtime: context document id "${id}" is invalid.`);
    }
    if (ids.has(id)) {
      throw new Error(`K.I.N.G.S. Owner Mission Runtime: duplicate context document id "${id}".`);
    }
    ids.add(id);
    const name = requiredText(value.name, "context document name", 512);
    const mediaType = requiredText(value.mediaType, "context media type", 128);
    const sha256 = requiredText(value.sha256, "context sha256", 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(sha256)) {
      throw new Error(`K.I.N.G.S. Owner Mission Runtime: context document "${id}" has an invalid SHA-256 digest.`);
    }
    const text = requiredText(value.text, "context document text", DEFAULT_MAX_CONTEXT_CHARS);
    totalCharacters += text.length;
    if (totalCharacters > DEFAULT_MAX_CONTEXT_CHARS) {
      throw new Error(`K.I.N.G.S. Owner Mission Runtime: total context exceeds ${DEFAULT_MAX_CONTEXT_CHARS} characters.`);
    }
    return { id, name, mediaType, sha256, text };
  });
}

function validatePersistedRecord(record: OwnerMissionRecord): void {
  if (!record || typeof record !== "object") {
    throw new Error("K.I.N.G.S. Owner Mission Runtime: persisted mission record is invalid.");
  }
  if (record.plan.missionId !== record.mission.id) {
    throw new Error("K.I.N.G.S. Owner Mission Runtime: persisted mission/plan identity mismatch.");
  }
  if (!record.plan.approvedByHuman || !record.plan.locked) {
    throw new Error("K.I.N.G.S. Owner Mission Runtime: persisted owner mission plan is not approved and locked.");
  }
  if (!Array.isArray(record.tasks) || record.tasks.length < 1) {
    throw new Error("K.I.N.G.S. Owner Mission Runtime: persisted mission requires executable tasks.");
  }
  if (record.tasks.some((task) => task.missionId !== record.mission.id)) {
    throw new Error("K.I.N.G.S. Owner Mission Runtime: persisted task belongs to a different mission.");
  }
  if (record.results !== undefined && !Array.isArray(record.results)) {
    throw new Error("K.I.N.G.S. Owner Mission Runtime: persisted workforce results must be an array.");
  }
  normalizeContextDocuments(record.contextDocuments ?? []);
}

function normalizeProductName(requested: string | undefined, ownerVision: string): string {
  const supplied = String(requested ?? "").trim();
  if (supplied) return supplied.slice(0, 160);
  const firstLine = ownerVision.split(/\r?\n/u).map((line) => line.trim()).find(Boolean);
  return (firstLine || "Owner Software Mission").slice(0, 160);
}

function requiredText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`K.I.N.G.S. Owner Mission Runtime: ${label} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized) throw new Error(`K.I.N.G.S. Owner Mission Runtime: ${label} is required.`);
  if (normalized.length > maximumLength) {
    throw new Error(`K.I.N.G.S. Owner Mission Runtime: ${label} exceeds ${maximumLength} characters.`);
  }
  return normalized;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
