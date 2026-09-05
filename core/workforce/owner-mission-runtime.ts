import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  resolve,
} from "node:path";
import {
  randomUUID,
} from "node:crypto";

import type {
  Mission,
  Task,
} from "./types";
import {
  MissionContinuityStore,
  type MissionPlan,
} from "./mission-continuity";
import {
  MissionExecutionCoordinator,
  type MissionExecutionCoordinatorSnapshot,
} from "./mission-execution-coordinator";
import {
  ProductBuildMissionAssembler,
} from "./product-build-mission-assembler";
import {
  WorkforceRegistry,
} from "./registry";

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
  createdAt: string;
  updatedAt: string;
}

export interface OwnerMissionSnapshot {
  mission: Mission;
  plan: MissionPlan;
  tasks: Task[];
  execution: MissionExecutionCoordinatorSnapshot;
  contextDocuments: Array<
    Omit<OwnerMissionContextDocument, "text"> & {
      characterCount: number;
    }
  >;
}

interface OwnerMissionStoreFile {
  version: number;
  records: OwnerMissionRecord[];
}

/**
 * Production owner-facing mission boundary.
 *
 * A Build From This Vision request is treated as explicit human approval for
 * the exact submitted vision. The existing product-build assembler creates the
 * real dependency-ordered task graph. This runtime then atomically persists the
 * canonical mission, approved/locked plan, tasks and governed context so an
 * owner mission survives a K.I.N.G.S. process restart.
 */
export class OwnerMissionRuntime {
  private readonly registry = new WorkforceRegistry();
  private readonly continuity = new MissionContinuityStore();
  private readonly coordinator = new MissionExecutionCoordinator({
    registry: this.registry,
  });
  private readonly assembler = new ProductBuildMissionAssembler(
    this.registry,
  );
  private readonly records = new Map<string, OwnerMissionRecord>();
  private initialized = false;

  constructor(
    private readonly storePath: string,
  ) {
    if (!String(storePath ?? "").trim()) {
      throw new Error(
        "K.I.N.G.S. Owner Mission Runtime: store path is required.",
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    let parsed: OwnerMissionStoreFile | undefined;
    try {
      const raw = await readFile(resolve(this.storePath), "utf8");
      parsed = JSON.parse(raw) as OwnerMissionStoreFile;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }
      throw new Error(
        `K.I.N.G.S. Owner Mission Runtime: failed to load persistent state: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (
      !parsed ||
      parsed.version !== STORE_VERSION ||
      !Array.isArray(parsed.records)
    ) {
      throw new Error(
        "K.I.N.G.S. Owner Mission Runtime: persistent state has an unsupported schema.",
      );
    }

    for (const record of parsed.records) {
      this.restoreRecord(record);
    }
  }

  async createMission(
    request: OwnerMissionCreateRequest,
  ): Promise<OwnerMissionSnapshot> {
    this.requireInitialized();

    const ownerVision = requiredText(
      request.ownerVision,
      "owner vision",
      DEFAULT_MAX_VISION_CHARS,
    );
    const contextDocuments = normalizeContextDocuments(
      request.contextDocuments ?? [],
    );
    const productName = normalizeProductName(
      request.productName,
      ownerVision,
    );
    const missionId = `owner-mission-${randomUUID()}`;
    const now = new Date().toISOString();
    const sourceReferences = [
      "owner-vision",
      ...contextDocuments.map((document) =>
        `owner-context:${document.id}:${document.sha256}`,
      ),
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

    const planningVision = combineVisionAndContext(
      ownerVision,
      contextDocuments,
    );
    const assembly = this.assembler.assemble({
      mission,
      plan,
      ownerVision: planningVision,
    });

    // Every generated task carries the owner's authoritative source/context
    // references in addition to dependency references. This keeps documents
    // available to later planning/coding stages without moving authority into
    // the browser.
    for (const task of assembly.tasks) {
      task.inputReferences = uniqueStrings([
        ...sourceReferences,
        ...task.inputReferences,
      ]);
    }

    const record: OwnerMissionRecord = {
      mission: clone(mission),
      plan: clone(plan),
      tasks: assembly.tasks.map(clone),
      ownerVision,
      contextDocuments: contextDocuments.map(clone),
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(missionId, record);

    try {
      await this.persist();
    } catch (error) {
      // Do not claim a durable mission if the atomic persistence boundary fails.
      this.records.delete(missionId);
      throw error;
    }

    return this.snapshot(missionId);
  }

  list(): OwnerMissionSnapshot[] {
    this.requireInitialized();
    return [...this.records.keys()]
      .sort()
      .map((missionId) => this.snapshot(missionId));
  }

  snapshot(missionId: string): OwnerMissionSnapshot {
    this.requireInitialized();
    const record = this.records.get(missionId);
    if (!record) {
      throw new Error(
        `K.I.N.G.S. Owner Mission Runtime: mission "${missionId}" was not found.`,
      );
    }

    return {
      mission: clone(record.mission),
      plan: clone(record.plan),
      tasks: record.tasks.map(clone),
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

  private restoreRecord(record: OwnerMissionRecord): void {
    validatePersistedRecord(record);
    const missionId = record.mission.id;
    if (this.records.has(missionId)) {
      throw new Error(
        `K.I.N.G.S. Owner Mission Runtime: duplicate persisted mission "${missionId}".`,
      );
    }

    this.registry.registerMission(clone(record.mission));
    this.continuity.registerMission(clone(record.mission));
    this.continuity.registerPlan(clone(record.plan));
    for (const task of record.tasks) {
      this.registry.registerTask(clone(task));
    }
    this.records.set(missionId, clone(record));
  }

  private async persist(): Promise<void> {
    const path = resolve(this.storePath);
    await mkdir(dirname(path), {
      recursive: true,
    });
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const payload: OwnerMissionStoreFile = {
      version: STORE_VERSION,
      records: [...this.records.values()]
        .sort((left, right) =>
          left.mission.id.localeCompare(right.mission.id),
        )
        .map(clone),
    };

    await writeFile(
      temporaryPath,
      `${JSON.stringify(payload, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
    await rename(temporaryPath, path);
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "K.I.N.G.S. Owner Mission Runtime: initialize() must complete before use.",
      );
    }
  }
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
    throw new Error(
      "K.I.N.G.S. Owner Mission Runtime: context documents must be an array.",
    );
  }
  if (documents.length > 32) {
    throw new Error(
      "K.I.N.G.S. Owner Mission Runtime: at most 32 context documents may be attached to one mission.",
    );
  }

  const ids = new Set<string>();
  let totalCharacters = 0;
  return documents.map((value) => {
    const id = requiredText(value.id, "context document id", 256);
    if (!/^[A-Za-z0-9._-]+$/u.test(id)) {
      throw new Error(
        `K.I.N.G.S. Owner Mission Runtime: context document id "${id}" is invalid.`,
      );
    }
    if (ids.has(id)) {
      throw new Error(
        `K.I.N.G.S. Owner Mission Runtime: duplicate context document id "${id}".`,
      );
    }
    ids.add(id);

    const name = requiredText(value.name, "context document name", 512);
    const mediaType = requiredText(value.mediaType, "context media type", 128);
    const sha256 = requiredText(value.sha256, "context sha256", 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(sha256)) {
      throw new Error(
        `K.I.N.G.S. Owner Mission Runtime: context document "${id}" has an invalid SHA-256 digest.`,
      );
    }
    const text = requiredText(value.text, "context document text", DEFAULT_MAX_CONTEXT_CHARS);
    totalCharacters += text.length;
    if (totalCharacters > DEFAULT_MAX_CONTEXT_CHARS) {
      throw new Error(
        `K.I.N.G.S. Owner Mission Runtime: total context exceeds ${DEFAULT_MAX_CONTEXT_CHARS} characters.`,
      );
    }

    return {
      id,
      name,
      mediaType,
      sha256,
      text,
    };
  });
}

function validatePersistedRecord(record: OwnerMissionRecord): void {
  if (!record || typeof record !== "object") {
    throw new Error(
      "K.I.N.G.S. Owner Mission Runtime: persisted mission record is invalid.",
    );
  }
  if (record.plan.missionId !== record.mission.id) {
    throw new Error(
      "K.I.N.G.S. Owner Mission Runtime: persisted mission/plan identity mismatch.",
    );
  }
  if (!record.plan.approvedByHuman || !record.plan.locked) {
    throw new Error(
      "K.I.N.G.S. Owner Mission Runtime: persisted owner mission plan is not approved and locked.",
    );
  }
  if (!Array.isArray(record.tasks) || record.tasks.length < 1) {
    throw new Error(
      "K.I.N.G.S. Owner Mission Runtime: persisted mission requires executable tasks.",
    );
  }
  if (record.tasks.some((task) => task.missionId !== record.mission.id)) {
    throw new Error(
      "K.I.N.G.S. Owner Mission Runtime: persisted task belongs to a different mission.",
    );
  }
  normalizeContextDocuments(record.contextDocuments ?? []);
}

function normalizeProductName(
  requested: string | undefined,
  ownerVision: string,
): string {
  const supplied = String(requested ?? "").trim();
  if (supplied) return supplied.slice(0, 160);

  const firstLine = ownerVision
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine || "Owner Software Mission").slice(0, 160);
}

function requiredText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `K.I.N.G.S. Owner Mission Runtime: ${label} must be text.`,
    );
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(
      `K.I.N.G.S. Owner Mission Runtime: ${label} is required.`,
    );
  }
  if (normalized.length > maximumLength) {
    throw new Error(
      `K.I.N.G.S. Owner Mission Runtime: ${label} exceeds ${maximumLength} characters.`,
    );
  }
  return normalized;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
