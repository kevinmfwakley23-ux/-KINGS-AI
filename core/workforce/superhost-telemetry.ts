import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ModelExecutionResult } from "./model-interface";

export type SuperhostTelemetrySpanKind =
  | "model"
  | "tool"
  | "routing";

export type SuperhostTelemetryStatus =
  | "ok"
  | "error";

export type SuperhostTelemetryAttribute =
  | string
  | number
  | boolean;

export interface SuperhostTelemetryRecord {
  schemaVersion: 1;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SuperhostTelemetrySpanKind;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: SuperhostTelemetryStatus;
  attributes: Record<string, SuperhostTelemetryAttribute>;
  errorCode?: string;
  errorMessage?: string;
  source: "kings-runtime";
}

export interface SuperhostTelemetrySummary {
  spans: number;
  okSpans: number;
  errorSpans: number;
  modelSpans: number;
  toolSpans: number;
  routingSpans: number;
  totalDurationMs: number;
  averageDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byProvider: Record<string, {
    spans: number;
    errors: number;
    totalDurationMs: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

export interface TelemetryContext {
  traceId: string;
  parentSpanId?: string;
}

const TRACE_ID = /^[0-9a-f]{32}$/;
const SPAN_ID = /^[0-9a-f]{16}$/;

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function newTraceId(): string {
  let value = "";
  do {
    value = randomBytes(16).toString("hex");
  } while (/^0+$/.test(value));
  return value;
}

function newSpanId(): string {
  let value = "";
  do {
    value = randomBytes(8).toString("hex");
  } while (/^0+$/.test(value));
  return value;
}

export function createTelemetryContext(
  parent?: TelemetryContext,
): TelemetryContext {
  return {
    traceId: parent?.traceId ?? newTraceId(),
    parentSpanId: parent?.parentSpanId,
  };
}

export function formatTraceparent(
  traceId: string,
  spanId: string,
  sampled = true,
): string {
  if (!TRACE_ID.test(traceId) || /^0+$/.test(traceId)) {
    throw new Error("K.I.N.G.S. Telemetry: trace id must be 32 non-zero lowercase hex characters");
  }
  if (!SPAN_ID.test(spanId) || /^0+$/.test(spanId)) {
    throw new Error("K.I.N.G.S. Telemetry: span id must be 16 non-zero lowercase hex characters");
  }
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

export function parseTraceparent(
  value: string | undefined,
): { traceId: string; parentSpanId: string; sampled: boolean } | undefined {
  if (!value) return undefined;
  const match = value.trim().match(
    /^00-([0-9a-f]{32})-([0-9a-f]{16})-(0[01])$/,
  );
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) {
    return undefined;
  }
  return {
    traceId: match[1],
    parentSpanId: match[2],
    sampled: match[3] === "01",
  };
}

export function modelExecutionTelemetry(
  providerId: string,
  modelId: string,
  result: ModelExecutionResult,
  context: TelemetryContext = { traceId: newTraceId() },
): SuperhostTelemetryRecord {
  const metadata = result.response?.metadata ?? result.failure?.metadata;
  if (!metadata) {
    throw new Error(
      "K.I.N.G.S. Telemetry: model execution result is missing timing metadata",
    );
  }
  const started = Date.parse(metadata.startedAt);
  const completed = Date.parse(metadata.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    throw new Error("K.I.N.G.S. Telemetry: invalid model execution timestamps");
  }

  const attributes: Record<string, SuperhostTelemetryAttribute> = {
    "gen_ai.operation.name": "chat",
    "gen_ai.request.model": modelId,
    "kings.provider.id": providerId,
    "kings.model.id": modelId,
    "kings.request.id": result.response?.requestId ?? result.failure?.requestId ?? "unknown",
    "kings.execution.success": result.success,
  };

  const usage = result.response?.usage;
  if (usage) {
    attributes["gen_ai.usage.input_tokens"] = usage.inputTokens;
    attributes["gen_ai.usage.output_tokens"] = usage.outputTokens;
    attributes["kings.usage.total_tokens"] = usage.tokensUsed;
    if (usage.cachedTokens !== undefined) {
      attributes["kings.usage.cached_tokens"] = usage.cachedTokens;
    }
    if (usage.savedTokens !== undefined) {
      attributes["kings.usage.saved_tokens"] = usage.savedTokens;
    }
    if (usage.reportedCostUsd !== undefined) {
      attributes["kings.cost.reported_usd"] = usage.reportedCostUsd;
    }
  }

  return {
    schemaVersion: 1,
    traceId: context.traceId,
    spanId: newSpanId(),
    parentSpanId: context.parentSpanId,
    name: "chat model",
    kind: "model",
    startedAt: metadata.startedAt,
    completedAt: metadata.completedAt,
    durationMs: metadata.latencyMs,
    status: result.success ? "ok" : "error",
    attributes,
    errorCode: result.failure?.code,
    errorMessage: result.failure?.message,
    source: "kings-runtime",
  };
}

export function validateSuperhostTelemetryRecord(
  record: SuperhostTelemetryRecord,
): void {
  if (record.schemaVersion !== 1) {
    throw new Error("K.I.N.G.S. Telemetry: unsupported schema version");
  }
  if (!TRACE_ID.test(record.traceId) || /^0+$/.test(record.traceId)) {
    throw new Error("K.I.N.G.S. Telemetry: invalid trace id");
  }
  if (!SPAN_ID.test(record.spanId) || /^0+$/.test(record.spanId)) {
    throw new Error("K.I.N.G.S. Telemetry: invalid span id");
  }
  if (
    record.parentSpanId !== undefined &&
    (!SPAN_ID.test(record.parentSpanId) || /^0+$/.test(record.parentSpanId))
  ) {
    throw new Error("K.I.N.G.S. Telemetry: invalid parent span id");
  }
  if (!record.name.trim() || record.name.length > 128) {
    throw new Error("K.I.N.G.S. Telemetry: span name is required and must be low-cardinality");
  }
  if (!finiteNonNegative(record.durationMs)) {
    throw new Error("K.I.N.G.S. Telemetry: duration must be a finite non-negative number");
  }
  const started = Date.parse(record.startedAt);
  const completed = Date.parse(record.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    throw new Error("K.I.N.G.S. Telemetry: invalid timestamps");
  }
  for (const [key, value] of Object.entries(record.attributes)) {
    if (!key.trim()) {
      throw new Error("K.I.N.G.S. Telemetry: attribute key cannot be empty");
    }
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(`K.I.N.G.S. Telemetry: invalid attribute value for ${key}`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`K.I.N.G.S. Telemetry: numeric attribute ${key} must be finite`);
    }
  }
}

export class DurableSuperhostTelemetryLedger {
  private writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async record(record: SuperhostTelemetryRecord): Promise<void> {
    validateSuperhostTelemetryRecord(record);
    const safeRecord: SuperhostTelemetryRecord = {
      ...record,
      attributes: { ...record.attributes },
    };
    const write = this.writeTail
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await appendFile(
          this.filePath,
          `${JSON.stringify(safeRecord)}\n`,
          "utf8",
        );
      });
    this.writeTail = write;
    await write;
  }

  async list(): Promise<SuperhostTelemetryRecord[]> {
    await this.writeTail.catch(() => undefined);
    let text: string;
    try {
      text = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const records: SuperhostTelemetryRecord[] = [];
    for (const [index, line] of text.split("\n").entries()) {
      if (!line.trim()) continue;
      let parsed: SuperhostTelemetryRecord;
      try {
        parsed = JSON.parse(line) as SuperhostTelemetryRecord;
      } catch (error) {
        throw new Error(
          `K.I.N.G.S. Telemetry: ledger line ${index + 1} is invalid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      validateSuperhostTelemetryRecord(parsed);
      records.push({
        ...parsed,
        attributes: { ...parsed.attributes },
      });
    }
    return records;
  }

  async summarize(): Promise<SuperhostTelemetrySummary> {
    const records = await this.list();
    const summary: SuperhostTelemetrySummary = {
      spans: 0,
      okSpans: 0,
      errorSpans: 0,
      modelSpans: 0,
      toolSpans: 0,
      routingSpans: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byProvider: {},
    };

    for (const record of records) {
      summary.spans += 1;
      if (record.status === "ok") summary.okSpans += 1;
      else summary.errorSpans += 1;
      if (record.kind === "model") summary.modelSpans += 1;
      else if (record.kind === "tool") summary.toolSpans += 1;
      else summary.routingSpans += 1;
      summary.totalDurationMs += record.durationMs;
      const input = Number(record.attributes["gen_ai.usage.input_tokens"] ?? 0);
      const output = Number(record.attributes["gen_ai.usage.output_tokens"] ?? 0);
      summary.totalInputTokens += Number.isFinite(input) ? input : 0;
      summary.totalOutputTokens += Number.isFinite(output) ? output : 0;

      const providerId = record.attributes["kings.provider.id"];
      if (typeof providerId !== "string") continue;
      const provider = summary.byProvider[providerId] ?? {
        spans: 0,
        errors: 0,
        totalDurationMs: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      provider.spans += 1;
      if (record.status === "error") provider.errors += 1;
      provider.totalDurationMs += record.durationMs;
      provider.inputTokens += Number.isFinite(input) ? input : 0;
      provider.outputTokens += Number.isFinite(output) ? output : 0;
      summary.byProvider[providerId] = provider;
    }

    summary.averageDurationMs = summary.spans > 0
      ? summary.totalDurationMs / summary.spans
      : 0;
    return summary;
  }
}
