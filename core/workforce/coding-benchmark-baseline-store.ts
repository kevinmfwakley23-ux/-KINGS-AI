import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  CodingBenchmarkLanguage,
  CodingBenchmarkSummary,
} from "./coding-benchmark-lab";

export interface CodingBenchmarkBaselineRecord {
  schemaVersion: 1;
  suiteId: string;
  acceptedAt: string;
  sourceRevision: string;
  summary: CodingBenchmarkSummary;
}

const LANGUAGES: CodingBenchmarkLanguage[] = [
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "java",
];

function validateSummary(summary: CodingBenchmarkSummary): void {
  for (const [name, value] of [
    ["cases", summary.cases],
    ["passed", summary.passed],
    ["passRate", summary.passRate],
    ["totalTokens", summary.totalTokens],
    ["cachedTokens", summary.cachedTokens],
    ["totalCostUsd", summary.totalCostUsd],
    ["totalDurationMs", summary.totalDurationMs],
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`K.I.N.G.S. Benchmark Baseline: ${name} must be finite and non-negative.`);
    }
  }
  if (summary.passed > summary.cases || summary.passRate > 1) {
    throw new Error("K.I.N.G.S. Benchmark Baseline: pass counts/rate are invalid.");
  }
  for (const language of LANGUAGES) {
    const value = summary.byLanguage[language];
    if (!value) {
      throw new Error(`K.I.N.G.S. Benchmark Baseline: missing language ${language}.`);
    }
    if (
      !Number.isInteger(value.cases) || value.cases < 0 ||
      !Number.isInteger(value.passed) || value.passed < 0 || value.passed > value.cases ||
      !Number.isFinite(value.passRate) || value.passRate < 0 || value.passRate > 1
    ) {
      throw new Error(`K.I.N.G.S. Benchmark Baseline: invalid metrics for ${language}.`);
    }
  }
}

function validateRecord(record: CodingBenchmarkBaselineRecord): void {
  if (record.schemaVersion !== 1) {
    throw new Error("K.I.N.G.S. Benchmark Baseline: unsupported schema version.");
  }
  if (!record.suiteId.trim() || !record.sourceRevision.trim()) {
    throw new Error("K.I.N.G.S. Benchmark Baseline: suite id and source revision are required.");
  }
  if (!Number.isFinite(Date.parse(record.acceptedAt))) {
    throw new Error("K.I.N.G.S. Benchmark Baseline: acceptedAt must be a valid timestamp.");
  }
  validateSummary(record.summary);
}

export class CodingBenchmarkBaselineStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<CodingBenchmarkBaselineRecord | undefined> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    let parsed: CodingBenchmarkBaselineRecord;
    try {
      parsed = JSON.parse(content) as CodingBenchmarkBaselineRecord;
    } catch (error) {
      throw new Error(
        `K.I.N.G.S. Benchmark Baseline: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    validateRecord(parsed);
    return JSON.parse(JSON.stringify(parsed)) as CodingBenchmarkBaselineRecord;
  }

  async saveAccepted(record: CodingBenchmarkBaselineRecord): Promise<void> {
    validateRecord(record);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temporary, this.filePath);
  }
}
