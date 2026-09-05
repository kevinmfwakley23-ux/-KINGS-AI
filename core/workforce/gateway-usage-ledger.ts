import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ModelExecutionResult } from "./model-interface";

export type GatewayCostStatus =
  | "provider-reported-free"
  | "provider-reported-cost"
  | "unknown";

export interface GatewayUsageObservation {
  requestId: string;
  providerRequestId?: string;
  providerId: string;
  modelId: string;
  startedAt: string;
  completedAt: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  savedTokens?: number;
  costUsd?: number;
  costStatus: GatewayCostStatus;
  source: "provider-response";
}

export interface GatewayUsageSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  savedTokens: number;
  requestsWithReportedSavings: number;
  knownCostUsd: number;
  freeRequests: number;
  paidRequests: number;
  unknownCostRequests: number;
  byProvider: Record<string, {
    requests: number;
    totalTokens: number;
    savedTokens: number;
    knownCostUsd: number;
  }>;
}

export interface GatewayUsageSink {
  record(observation: GatewayUsageObservation): Promise<void>;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function gatewayUsageObservationFromResult(
  providerId: string,
  modelId: string,
  result: ModelExecutionResult,
): GatewayUsageObservation | undefined {
  if (!result.success || !result.response) return undefined;
  const response = result.response;
  const costUsd = response.usage.reportedCostUsd;
  return {
    requestId: response.requestId,
    providerRequestId: response.metadata.providerRequestId,
    providerId,
    modelId,
    startedAt: response.metadata.startedAt,
    completedAt: response.metadata.completedAt,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    totalTokens: response.usage.tokensUsed,
    cachedTokens: response.usage.cachedTokens,
    savedTokens: response.usage.savedTokens,
    costUsd,
    costStatus: costUsd === undefined
      ? "unknown"
      : costUsd === 0
        ? "provider-reported-free"
        : "provider-reported-cost",
    source: "provider-response",
  };
}

export function validateGatewayUsageObservation(
  observation: GatewayUsageObservation,
): void {
  if (!observation.requestId.trim()) {
    throw new Error("K.I.N.G.S. Gateway Usage: request id is required.");
  }
  if (!observation.providerId.trim() || !observation.modelId.trim()) {
    throw new Error("K.I.N.G.S. Gateway Usage: provider and model ids are required.");
  }
  for (const [name, value] of [
    ["inputTokens", observation.inputTokens],
    ["outputTokens", observation.outputTokens],
    ["totalTokens", observation.totalTokens],
  ] as const) {
    if (!finiteNonNegative(value)) {
      throw new Error(`K.I.N.G.S. Gateway Usage: ${name} must be a finite non-negative number.`);
    }
  }
  if (observation.totalTokens < observation.inputTokens + observation.outputTokens) {
    throw new Error(
      "K.I.N.G.S. Gateway Usage: totalTokens cannot be less than inputTokens + outputTokens.",
    );
  }
  for (const [name, value] of [
    ["cachedTokens", observation.cachedTokens],
    ["savedTokens", observation.savedTokens],
    ["costUsd", observation.costUsd],
  ] as const) {
    if (value !== undefined && !finiteNonNegative(value)) {
      throw new Error(`K.I.N.G.S. Gateway Usage: ${name} must be a finite non-negative number when reported.`);
    }
  }
  const expectedCostStatus = observation.costUsd === undefined
    ? "unknown"
    : observation.costUsd === 0
      ? "provider-reported-free"
      : "provider-reported-cost";
  if (observation.costStatus !== expectedCostStatus) {
    throw new Error(
      `K.I.N.G.S. Gateway Usage: costStatus ${observation.costStatus} does not match provider-reported cost data.`,
    );
  }
}

export class DurableGatewayUsageLedger implements GatewayUsageSink {
  private writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async record(observation: GatewayUsageObservation): Promise<void> {
    validateGatewayUsageObservation(observation);
    const write = this.writeTail
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await appendFile(
          this.filePath,
          `${JSON.stringify(observation)}\n`,
          "utf8",
        );
      });
    this.writeTail = write;
    await write;
  }

  async list(): Promise<GatewayUsageObservation[]> {
    await this.writeTail.catch(() => undefined);
    let text: string;
    try {
      text = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const records: GatewayUsageObservation[] = [];
    for (const [index, line] of text.split("\n").entries()) {
      if (!line.trim()) continue;
      let parsed: GatewayUsageObservation;
      try {
        parsed = JSON.parse(line) as GatewayUsageObservation;
      } catch (error) {
        throw new Error(
          `K.I.N.G.S. Gateway Usage: ledger line ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      validateGatewayUsageObservation(parsed);
      records.push(parsed);
    }
    return records;
  }

  async summarize(): Promise<GatewayUsageSummary> {
    const records = await this.list();
    const summary: GatewayUsageSummary = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      savedTokens: 0,
      requestsWithReportedSavings: 0,
      knownCostUsd: 0,
      freeRequests: 0,
      paidRequests: 0,
      unknownCostRequests: 0,
      byProvider: {},
    };

    for (const record of records) {
      summary.requests += 1;
      summary.inputTokens += record.inputTokens;
      summary.outputTokens += record.outputTokens;
      summary.totalTokens += record.totalTokens;
      summary.cachedTokens += record.cachedTokens ?? 0;
      summary.savedTokens += record.savedTokens ?? 0;
      if (record.savedTokens !== undefined) summary.requestsWithReportedSavings += 1;
      summary.knownCostUsd += record.costUsd ?? 0;
      if (record.costStatus === "provider-reported-free") summary.freeRequests += 1;
      else if (record.costStatus === "provider-reported-cost") summary.paidRequests += 1;
      else summary.unknownCostRequests += 1;

      const provider = summary.byProvider[record.providerId] ?? {
        requests: 0,
        totalTokens: 0,
        savedTokens: 0,
        knownCostUsd: 0,
      };
      provider.requests += 1;
      provider.totalTokens += record.totalTokens;
      provider.savedTokens += record.savedTokens ?? 0;
      provider.knownCostUsd += record.costUsd ?? 0;
      summary.byProvider[record.providerId] = provider;
    }

    return summary;
  }
}
