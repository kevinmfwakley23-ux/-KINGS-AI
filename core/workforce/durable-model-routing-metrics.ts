import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import {
  modelRoutingMetricKey,
  type ModelCostBasis,
  type ModelRoutingMetrics,
} from "./model-routing";

interface PersistedRouteMetric {
  providerId: string;
  modelId: string;
  metric: ModelRoutingMetrics;
  updatedAt: string;
}

interface PersistedRouteMetricDocument {
  version: 1;
  routes: PersistedRouteMetric[];
}

const COST_BASES = new Set<ModelCostBasis>([
  "verified-free",
  "provider-reported",
  "configured-estimate",
  "unknown",
]);

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateMetric(metric: ModelRoutingMetrics): void {
  if (!finiteNonNegative(metric.latencyMs)) {
    throw new Error(
      "K.I.N.G.S. Routing Metrics Store: latencyMs must be finite and non-negative.",
    );
  }
  if (
    typeof metric.reliability !== "number" ||
    !Number.isFinite(metric.reliability) ||
    metric.reliability < 0 ||
    metric.reliability > 100
  ) {
    throw new Error(
      "K.I.N.G.S. Routing Metrics Store: reliability must be between 0 and 100.",
    );
  }
  if (
    metric.estimatedCost !== undefined &&
    !finiteNonNegative(metric.estimatedCost)
  ) {
    throw new Error(
      "K.I.N.G.S. Routing Metrics Store: estimatedCost must be finite and non-negative when present.",
    );
  }
  if (metric.costBasis !== undefined && !COST_BASES.has(metric.costBasis)) {
    throw new Error(
      `K.I.N.G.S. Routing Metrics Store: unsupported cost basis "${String(metric.costBasis)}".`,
    );
  }
}

function validateRecord(record: PersistedRouteMetric): void {
  if (!record.providerId?.trim() || !record.modelId?.trim()) {
    throw new Error(
      "K.I.N.G.S. Routing Metrics Store: providerId and modelId are required.",
    );
  }
  if (!record.updatedAt || Number.isNaN(Date.parse(record.updatedAt))) {
    throw new Error(
      "K.I.N.G.S. Routing Metrics Store: updatedAt must be a valid timestamp.",
    );
  }
  validateMetric(record.metric);
}

export class DurableModelRoutingMetricsStore {
  private readonly records = new Map<string, PersistedRouteMetric>();
  private loaded = false;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<Map<string, ModelRoutingMetrics>> {
    await this.ensureLoaded();
    return new Map(
      Array.from(this.records.entries()).map(([key, record]) => [
        key,
        { ...record.metric },
      ]),
    );
  }

  async record(
    providerId: string,
    modelId: string,
    metric: ModelRoutingMetrics,
  ): Promise<void> {
    await this.ensureLoaded();
    validateMetric(metric);
    if (!providerId.trim() || !modelId.trim()) {
      throw new Error(
        "K.I.N.G.S. Routing Metrics Store: providerId and modelId are required.",
      );
    }

    const key = modelRoutingMetricKey(providerId, modelId);
    const next: PersistedRouteMetric = {
      providerId,
      modelId,
      metric: { ...metric },
      updatedAt: new Date().toISOString(),
    };
    this.records.set(key, next);

    const write = this.writeTail
      .catch(() => undefined)
      .then(() => this.persist());
    this.writeTail = write;
    await write;
  }

  async snapshot(): Promise<PersistedRouteMetric[]> {
    await this.ensureLoaded();
    await this.writeTail.catch(() => undefined);
    return Array.from(this.records.values())
      .map((record) => ({
        ...record,
        metric: { ...record.metric },
      }))
      .sort((left, right) => {
        const provider = left.providerId.localeCompare(right.providerId);
        return provider !== 0
          ? provider
          : left.modelId.localeCompare(right.modelId);
      });
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    let text: string;
    try {
      text = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.loaded = true;
        return;
      }
      throw error;
    }

    let document: PersistedRouteMetricDocument;
    try {
      document = JSON.parse(text) as PersistedRouteMetricDocument;
    } catch (error) {
      throw new Error(
        `K.I.N.G.S. Routing Metrics Store: invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (document.version !== 1 || !Array.isArray(document.routes)) {
      throw new Error(
        "K.I.N.G.S. Routing Metrics Store: unsupported or malformed document.",
      );
    }

    for (const record of document.routes) {
      validateRecord(record);
      this.records.set(
        modelRoutingMetricKey(record.providerId, record.modelId),
        {
          ...record,
          metric: { ...record.metric },
        },
      );
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const document: PersistedRouteMetricDocument = {
      version: 1,
      routes: Array.from(this.records.values())
        .map((record) => ({
          ...record,
          metric: { ...record.metric },
        }))
        .sort((left, right) => {
          const provider = left.providerId.localeCompare(right.providerId);
          return provider !== 0
            ? provider
            : left.modelId.localeCompare(right.modelId);
        }),
    };

    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await writeFile(
        temporary,
        `${JSON.stringify(document, null, 2)}\n`,
        "utf8",
      );
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}
