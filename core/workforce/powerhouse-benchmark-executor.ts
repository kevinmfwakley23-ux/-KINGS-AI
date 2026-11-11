import { createHash } from "node:crypto";

import {
  AppAiRouter,
  type AppAiRouteAttempt,
  type AppAiRouteResult,
} from "./app-ai-router";
import {
  type PowerhouseBenchmarkManifest,
  type PowerhouseBenchmarkResponse,
  validatePowerhouseBenchmarkManifest,
} from "./powerhouse-benchmark-runner";
import {
  applyPowerhouseServiceDomain,
  resolvePowerhouseServiceDomain,
} from "./powerhouse-service-domain";

export interface PowerhouseBenchmarkExecutionUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  elapsedMs: number;
}

interface PowerhouseBenchmarkExecutionRecordBase {
  taskId: string;
  requestId: string;
  providerId: string;
  modelId: string;
  executionAttempts: number;
  routeAttempts: readonly AppAiRouteAttempt[];
  completedAt: string;
  evidenceSha256: string;
}

export interface PowerhouseBenchmarkExecutionSuccess
  extends PowerhouseBenchmarkExecutionRecordBase {
  status: "succeeded";
  output: string;
  usage: PowerhouseBenchmarkExecutionUsage;
}

export interface PowerhouseBenchmarkExecutionFailure
  extends PowerhouseBenchmarkExecutionRecordBase {
  status: "failed";
  code: string;
  message: string;
}

export type PowerhouseBenchmarkExecutionRecord =
  | PowerhouseBenchmarkExecutionSuccess
  | PowerhouseBenchmarkExecutionFailure;

export interface PowerhouseBenchmarkExecutionCheckpoint {
  schemaVersion: "1";
  runId: string;
  benchmarkId: string;
  benchmarkVersion: string;
  manifestSha256: string;
  providerId: string;
  modelId: string;
  startedAt: string;
  updatedAt: string;
  records: PowerhouseBenchmarkExecutionRecord[];
}

export interface PowerhouseBenchmarkCheckpointStore {
  load(): Promise<PowerhouseBenchmarkExecutionCheckpoint | undefined>;
  save(checkpoint: PowerhouseBenchmarkExecutionCheckpoint): Promise<void>;
}

export interface PowerhouseBenchmarkExecutionRequest {
  runId: string;
  providerId: string;
  modelId: string;
  manifest: PowerhouseBenchmarkManifest;
  checkpointStore: PowerhouseBenchmarkCheckpointStore;
  concurrency?: number;
  maxAttemptsPerTask?: number;
  retryDelayMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface PowerhouseBenchmarkExecutionResult {
  checkpoint: PowerhouseBenchmarkExecutionCheckpoint;
  responses: PowerhouseBenchmarkResponse[];
  succeededTasks: number;
  failedTasks: number;
  resumedTasks: number;
  executedTasks: number;
}

export interface PowerhouseBenchmarkExecutorDependencies {
  now?: () => Date;
  delay?: (milliseconds: number) => Promise<void>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u.test(value.trim())) {
    throw new Error(`K.I.N.G.S. Powerhouse Executor: ${label} is invalid`);
  }
  return value.trim();
}

function integerOption(value: number | undefined, fallback: number, minimum: number, maximum: number, label: string): number {
  const selected = value ?? fallback;
  if (!Number.isInteger(selected) || selected < minimum || selected > maximum) {
    throw new Error(`K.I.N.G.S. Powerhouse Executor: ${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return selected;
}

function recordHash(record: Omit<PowerhouseBenchmarkExecutionRecord, "evidenceSha256">): string {
  return sha256(stableJson(record));
}

function withEvidenceHash(
  record: Omit<PowerhouseBenchmarkExecutionSuccess, "evidenceSha256">,
): PowerhouseBenchmarkExecutionSuccess;
function withEvidenceHash(
  record: Omit<PowerhouseBenchmarkExecutionFailure, "evidenceSha256">,
): PowerhouseBenchmarkExecutionFailure;
function withEvidenceHash(
  record:
    | Omit<PowerhouseBenchmarkExecutionSuccess, "evidenceSha256">
    | Omit<PowerhouseBenchmarkExecutionFailure, "evidenceSha256">,
): PowerhouseBenchmarkExecutionRecord {
  return { ...record, evidenceSha256: recordHash(record) } as PowerhouseBenchmarkExecutionRecord;
}

function validateRecord(
  record: PowerhouseBenchmarkExecutionRecord,
  taskIds: ReadonlySet<string>,
  providerId: string,
  modelId: string,
): void {
  if (!record || typeof record !== "object") {
    throw new Error("K.I.N.G.S. Powerhouse Executor: checkpoint record must be an object");
  }
  if (!taskIds.has(record.taskId)) {
    throw new Error(`K.I.N.G.S. Powerhouse Executor: checkpoint contains unknown task "${record.taskId}"`);
  }
  if (record.providerId !== providerId || record.modelId !== modelId) {
    throw new Error(`K.I.N.G.S. Powerhouse Executor: checkpoint target mismatch for "${record.taskId}"`);
  }
  if (!/^[a-f0-9]{64}$/u.test(record.evidenceSha256)) {
    throw new Error(`K.I.N.G.S. Powerhouse Executor: checkpoint evidence hash is invalid for "${record.taskId}"`);
  }
  const { evidenceSha256, ...core } = record;
  if (recordHash(core as Omit<PowerhouseBenchmarkExecutionRecord, "evidenceSha256">) !== evidenceSha256) {
    throw new Error(`K.I.N.G.S. Powerhouse Executor: checkpoint evidence was altered for "${record.taskId}"`);
  }
  if (record.status === "succeeded" && typeof record.output !== "string") {
    throw new Error(`K.I.N.G.S. Powerhouse Executor: checkpoint output is invalid for "${record.taskId}"`);
  }
  const rawRecord = record as unknown as { status?: unknown; taskId?: unknown };
  if (rawRecord.status !== "succeeded" && rawRecord.status !== "failed") {
    throw new Error(
      `K.I.N.G.S. Powerhouse Executor: checkpoint status is invalid for "${String(rawRecord.taskId)}"`,
    );
  }
}

function validateCheckpoint(
  checkpoint: PowerhouseBenchmarkExecutionCheckpoint,
  expected: Omit<PowerhouseBenchmarkExecutionCheckpoint, "startedAt" | "updatedAt" | "records">,
  taskIds: ReadonlySet<string>,
): void {
  if (!checkpoint || typeof checkpoint !== "object" || checkpoint.schemaVersion !== "1") {
    throw new Error("K.I.N.G.S. Powerhouse Executor: checkpoint schema is invalid");
  }
  for (const field of [
    "runId",
    "benchmarkId",
    "benchmarkVersion",
    "manifestSha256",
    "providerId",
    "modelId",
  ] as const) {
    if (checkpoint[field] !== expected[field]) {
      throw new Error(`K.I.N.G.S. Powerhouse Executor: checkpoint ${field} does not match this run`);
    }
  }
  if (!Array.isArray(checkpoint.records)) {
    throw new Error("K.I.N.G.S. Powerhouse Executor: checkpoint records must be an array");
  }
  const seen = new Set<string>();
  for (const record of checkpoint.records) {
    validateRecord(record, taskIds, expected.providerId, expected.modelId);
    if (seen.has(record.taskId)) {
      throw new Error(`K.I.N.G.S. Powerhouse Executor: duplicate checkpoint task "${record.taskId}"`);
    }
    seen.add(record.taskId);
  }
}

export function validatePowerhouseBenchmarkExecutionCheckpoint(
  checkpoint: PowerhouseBenchmarkExecutionCheckpoint,
  manifest: PowerhouseBenchmarkManifest,
): void {
  const manifestSha256 = validatePowerhouseBenchmarkManifest(manifest);
  const taskIds = new Set(
    manifest.items.filter((item) => item.split === "held-out").map((item) => item.id),
  );
  validateCheckpoint(checkpoint, {
    schemaVersion: "1",
    runId: requiredId(checkpoint.runId, "checkpoint run id"),
    benchmarkId: manifest.benchmarkId,
    benchmarkVersion: manifest.benchmarkVersion,
    manifestSha256,
    providerId: requiredId(checkpoint.providerId, "checkpoint provider id"),
    modelId: requiredId(checkpoint.modelId, "checkpoint model id"),
  }, taskIds);
}

export function powerhouseResponsesFromCheckpoint(
  checkpoint: PowerhouseBenchmarkExecutionCheckpoint,
): PowerhouseBenchmarkResponse[] {
  return checkpoint.records.flatMap((record) => {
    if (record.status !== "succeeded") return [];
    return [{
      taskId: record.taskId,
      modelId: record.modelId,
      output: record.output,
      completedAt: record.completedAt,
      evidenceReferences: [`benchmark-route:sha256:${record.evidenceSha256}`],
    }];
  });
}

export class PowerhouseBenchmarkExecutor {
  private readonly now: () => Date;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly router: AppAiRouter,
    dependencies: PowerhouseBenchmarkExecutorDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.delay = dependencies.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async execute(request: PowerhouseBenchmarkExecutionRequest): Promise<PowerhouseBenchmarkExecutionResult> {
    const runId = requiredId(request.runId, "run id");
    const providerId = requiredId(request.providerId, "provider id");
    const modelId = requiredId(request.modelId, "model id");
    const concurrency = integerOption(request.concurrency, 1, 1, 8, "concurrency");
    const maxAttempts = integerOption(request.maxAttemptsPerTask, 2, 1, 3, "max attempts per task");
    const retryDelayMs = integerOption(request.retryDelayMs, 1_000, 0, 30_000, "retry delay milliseconds");
    const maxOutputTokens = integerOption(request.maxOutputTokens, 2_048, 1, 65_536, "max output tokens");
    const temperature = request.temperature ?? 0;
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error("K.I.N.G.S. Powerhouse Executor: temperature must be between 0 and 2");
    }

    const manifestSha256 = validatePowerhouseBenchmarkManifest(request.manifest);
    const tasks = request.manifest.items.filter((item) => item.split === "held-out");
    const taskIds = new Set(tasks.map((task) => task.id));
    const identity = {
      schemaVersion: "1" as const,
      runId,
      benchmarkId: request.manifest.benchmarkId,
      benchmarkVersion: request.manifest.benchmarkVersion,
      manifestSha256,
      providerId,
      modelId,
    };

    const loaded = await request.checkpointStore.load();
    if (loaded) validateCheckpoint(loaded, identity, taskIds);
    let checkpoint: PowerhouseBenchmarkExecutionCheckpoint = loaded ?? {
      ...identity,
      startedAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
      records: [],
    };
    const completed = new Map(checkpoint.records.map((record) => [record.taskId, record]));
    const pending = tasks.filter((task) => !completed.has(task.id));
    const resumedTasks = completed.size;

    for (let offset = 0; offset < pending.length; offset += concurrency) {
      const batch = pending.slice(offset, offset + concurrency);
      const records = await Promise.all(batch.map((task) => this.executeTask({
        runId,
        providerId,
        modelId,
        task,
        maxAttempts,
        retryDelayMs,
        maxOutputTokens,
        temperature,
      })));
      for (const record of records) completed.set(record.taskId, record);
      checkpoint = {
        ...checkpoint,
        updatedAt: this.now().toISOString(),
        records: tasks.flatMap((task) => {
          const record = completed.get(task.id);
          return record ? [record] : [];
        }),
      };
      await request.checkpointStore.save(checkpoint);
    }

    if (pending.length === 0 && !loaded) await request.checkpointStore.save(checkpoint);
    const responses = powerhouseResponsesFromCheckpoint(checkpoint);
    return {
      checkpoint,
      responses,
      succeededTasks: checkpoint.records.filter((record) => record.status === "succeeded").length,
      failedTasks: checkpoint.records.filter((record) => record.status === "failed").length,
      resumedTasks,
      executedTasks: pending.length,
    };
  }

  private async executeTask(input: {
    runId: string;
    providerId: string;
    modelId: string;
    task: PowerhouseBenchmarkManifest["items"][number];
    maxAttempts: number;
    retryDelayMs: number;
    maxOutputTokens: number;
    temperature: number;
  }): Promise<PowerhouseBenchmarkExecutionRecord> {
    const requestId = `eval-${sha256(`${input.runId}:${input.task.id}`).slice(0, 48)}`;
    let lastResult: AppAiRouteResult | undefined;
    let executionAttempts = 0;
    for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
      executionAttempts = attempt;
      try {
        const routeRequest = applyPowerhouseServiceDomain({
          appId: "kings.powerhouse.evaluation",
          requestId,
          providerId: input.providerId,
          modelId: input.modelId,
          messages: [{ role: "user", content: input.task.prompt }],
          maxOutputTokens: input.maxOutputTokens,
          temperature: input.temperature,
          allowToolProposals: false,
        }, resolvePowerhouseServiceDomain(input.task.domain));
        lastResult = await this.router.route(routeRequest);
      } catch (error) {
        const completedAt = this.now().toISOString();
        return withEvidenceHash({
          status: "failed",
          taskId: input.task.id,
          requestId,
          providerId: input.providerId,
          modelId: input.modelId,
          executionAttempts,
          routeAttempts: [],
          completedAt,
          code: "ROUTER_EXCEPTION",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (lastResult.success) {
        const completedAt = this.now().toISOString();
        if (lastResult.providerId !== input.providerId || lastResult.modelId !== input.modelId) {
          return withEvidenceHash({
            status: "failed",
            taskId: input.task.id,
            requestId,
            providerId: input.providerId,
            modelId: input.modelId,
            executionAttempts,
            routeAttempts: lastResult.attempts,
            completedAt,
            code: "TARGET_IDENTITY_MISMATCH",
            message: "The router returned a provider/model other than the locked benchmark target.",
          });
        }
        return withEvidenceHash({
          status: "succeeded",
          taskId: input.task.id,
          requestId,
          providerId: lastResult.providerId,
          modelId: lastResult.modelId,
          executionAttempts,
          routeAttempts: lastResult.attempts,
          completedAt,
          output: lastResult.content,
          usage: { ...lastResult.usage },
        });
      }

      const retryable = lastResult.attempts.at(-1)?.retryable === true;
      if (!retryable || attempt === input.maxAttempts) break;
      await this.delay(input.retryDelayMs);
    }

    const completedAt = this.now().toISOString();
    return withEvidenceHash({
      status: "failed",
      taskId: input.task.id,
      requestId,
      providerId: input.providerId,
      modelId: input.modelId,
      executionAttempts,
      routeAttempts: lastResult?.attempts ?? [],
      completedAt,
      code: lastResult && !lastResult.success ? lastResult.code : "MODEL_EXECUTION_FAILED",
      message: lastResult && !lastResult.success
        ? lastResult.message
        : "The locked benchmark target did not return a usable response.",
    });
  }
}
