import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CodingBenchmarkLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java";

export interface CodingBenchmarkVerificationStep {
  command: string;
  args: string[];
  timeoutMs?: number;
}

export interface CodingBenchmarkCase {
  id: string;
  language: CodingBenchmarkLanguage;
  fixtureRoot: string;
  objective: string;
  acceptanceCriteria: string[];
  verification: CodingBenchmarkVerificationStep[];
  maxTouchedFiles?: number;
}

export interface CodingBenchmarkCandidateResult {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  touchedFiles?: string[];
  routeLabel?: string;
}

export interface CodingBenchmarkExecution {
  benchmarkId: string;
  language: CodingBenchmarkLanguage;
  passed: boolean;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
  touchedFiles: string[];
  routeLabel?: string;
  verification: Array<{
    command: string;
    passed: boolean;
    stdout: string;
    stderr: string;
  }>;
  failureReason?: string;
}

export interface CodingBenchmarkSummary {
  cases: number;
  passed: number;
  passRate: number;
  totalTokens: number;
  cachedTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  byLanguage: Record<CodingBenchmarkLanguage, {
    cases: number;
    passed: number;
    passRate: number;
  }>;
}

export interface CodingBenchmarkRegressionThresholds {
  minimumPassRate?: number;
  maximumPassRateDrop?: number;
  maximumTokenIncreaseRatio?: number;
  maximumCostIncreaseRatio?: number;
  maximumDurationIncreaseRatio?: number;
}

export interface CodingBenchmarkRegressionDecision {
  accepted: boolean;
  regressions: string[];
  current: CodingBenchmarkSummary;
  baseline?: CodingBenchmarkSummary;
}

export type CodingBenchmarkCandidate = (
  benchmark: CodingBenchmarkCase,
  workspaceRoot: string,
) => Promise<CodingBenchmarkCandidateResult>;

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateCase(benchmark: CodingBenchmarkCase): void {
  if (!benchmark.id.trim()) throw new Error("K.I.N.G.S. Benchmark: id is required.");
  if (!benchmark.fixtureRoot.trim()) throw new Error(`K.I.N.G.S. Benchmark ${benchmark.id}: fixture root is required.`);
  if (!benchmark.objective.trim()) throw new Error(`K.I.N.G.S. Benchmark ${benchmark.id}: objective is required.`);
  if (benchmark.acceptanceCriteria.length === 0 || benchmark.acceptanceCriteria.some((item) => !item.trim())) {
    throw new Error(`K.I.N.G.S. Benchmark ${benchmark.id}: acceptance criteria are required.`);
  }
  if (benchmark.verification.length === 0) {
    throw new Error(`K.I.N.G.S. Benchmark ${benchmark.id}: executable verification is required.`);
  }
  for (const step of benchmark.verification) {
    if (!step.command.trim()) throw new Error(`K.I.N.G.S. Benchmark ${benchmark.id}: verification command is required.`);
    if (step.timeoutMs !== undefined && (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 1)) {
      throw new Error(`K.I.N.G.S. Benchmark ${benchmark.id}: timeout must be a positive integer.`);
    }
  }
}

export class MultilingualCodingBenchmarkRegistry {
  private readonly cases = new Map<string, CodingBenchmarkCase>();

  register(benchmark: CodingBenchmarkCase): void {
    validateCase(benchmark);
    if (this.cases.has(benchmark.id)) {
      throw new Error(`K.I.N.G.S. Benchmark: duplicate benchmark id "${benchmark.id}".`);
    }
    this.cases.set(benchmark.id, {
      ...benchmark,
      acceptanceCriteria: [...benchmark.acceptanceCriteria],
      verification: benchmark.verification.map((step) => ({ ...step, args: [...step.args] })),
    });
  }

  list(): CodingBenchmarkCase[] {
    return [...this.cases.values()].map((benchmark) => ({
      ...benchmark,
      acceptanceCriteria: [...benchmark.acceptanceCriteria],
      verification: benchmark.verification.map((step) => ({ ...step, args: [...step.args] })),
    }));
  }
}

export class CodingBenchmarkRunner {
  async run(
    benchmark: CodingBenchmarkCase,
    candidate: CodingBenchmarkCandidate,
  ): Promise<CodingBenchmarkExecution> {
    validateCase(benchmark);
    const temp = await mkdtemp(join(tmpdir(), `kings-benchmark-${benchmark.id}-`));
    const workspace = join(temp, basename(benchmark.fixtureRoot) || "fixture");
    const started = Date.now();
    try {
      await cp(benchmark.fixtureRoot, workspace, { recursive: true, force: false });
      let candidateResult: CodingBenchmarkCandidateResult;
      try {
        candidateResult = await candidate(benchmark, workspace);
      } catch (error) {
        return this.failure(
          benchmark,
          Date.now() - started,
          `Candidate execution failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const inputTokens = candidateResult.inputTokens ?? 0;
      const outputTokens = candidateResult.outputTokens ?? 0;
      const cachedTokens = candidateResult.cachedTokens ?? 0;
      const costUsd = candidateResult.costUsd ?? 0;
      for (const [name, value] of [
        ["inputTokens", inputTokens],
        ["outputTokens", outputTokens],
        ["cachedTokens", cachedTokens],
        ["costUsd", costUsd],
      ] as const) {
        if (!finiteNonNegative(value)) {
          return this.failure(benchmark, Date.now() - started, `${name} was not finite and non-negative.`);
        }
      }

      const touchedFiles = [...new Set(candidateResult.touchedFiles ?? [])].sort();
      if (benchmark.maxTouchedFiles !== undefined && touchedFiles.length > benchmark.maxTouchedFiles) {
        return {
          ...this.failure(
            benchmark,
            Date.now() - started,
            `Candidate touched ${touchedFiles.length} files; benchmark limit is ${benchmark.maxTouchedFiles}.`,
          ),
          inputTokens,
          outputTokens,
          cachedTokens,
          totalTokens: inputTokens + outputTokens,
          costUsd,
          touchedFiles,
          routeLabel: candidateResult.routeLabel,
        };
      }

      const verification: CodingBenchmarkExecution["verification"] = [];
      for (const step of benchmark.verification) {
        try {
          const result = await execFileAsync(step.command, step.args, {
            cwd: workspace,
            encoding: "utf8",
            timeout: step.timeoutMs ?? 60_000,
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true,
          });
          verification.push({
            command: [step.command, ...step.args].join(" "),
            passed: true,
            stdout: result.stdout,
            stderr: result.stderr,
          });
        } catch (error) {
          const failure = error as Error & { stdout?: string; stderr?: string };
          verification.push({
            command: [step.command, ...step.args].join(" "),
            passed: false,
            stdout: failure.stdout ?? "",
            stderr: failure.stderr ?? failure.message,
          });
          return {
            benchmarkId: benchmark.id,
            language: benchmark.language,
            passed: false,
            durationMs: Date.now() - started,
            inputTokens,
            outputTokens,
            cachedTokens,
            totalTokens: inputTokens + outputTokens,
            costUsd,
            touchedFiles,
            routeLabel: candidateResult.routeLabel,
            verification,
            failureReason: `Executable verification failed: ${[step.command, ...step.args].join(" ")}`,
          };
        }
      }

      return {
        benchmarkId: benchmark.id,
        language: benchmark.language,
        passed: true,
        durationMs: Date.now() - started,
        inputTokens,
        outputTokens,
        cachedTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd,
        touchedFiles,
        routeLabel: candidateResult.routeLabel,
        verification,
      };
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }

  summarize(executions: readonly CodingBenchmarkExecution[]): CodingBenchmarkSummary {
    const languages: CodingBenchmarkLanguage[] = [
      "typescript", "javascript", "python", "go", "rust", "java",
    ];
    const byLanguage = Object.fromEntries(
      languages.map((language) => [language, { cases: 0, passed: 0, passRate: 0 }]),
    ) as CodingBenchmarkSummary["byLanguage"];
    let passed = 0;
    let totalTokens = 0;
    let cachedTokens = 0;
    let totalCostUsd = 0;
    let totalDurationMs = 0;
    for (const execution of executions) {
      if (execution.passed) passed += 1;
      totalTokens += execution.totalTokens;
      cachedTokens += execution.cachedTokens;
      totalCostUsd += execution.costUsd;
      totalDurationMs += execution.durationMs;
      const language = byLanguage[execution.language];
      language.cases += 1;
      if (execution.passed) language.passed += 1;
    }
    for (const language of languages) {
      const value = byLanguage[language];
      value.passRate = value.cases === 0 ? 0 : value.passed / value.cases;
    }
    return {
      cases: executions.length,
      passed,
      passRate: executions.length === 0 ? 0 : passed / executions.length,
      totalTokens,
      cachedTokens,
      totalCostUsd,
      totalDurationMs,
      byLanguage,
    };
  }

  compare(
    currentExecutions: readonly CodingBenchmarkExecution[],
    baseline: CodingBenchmarkSummary | undefined,
    thresholds: CodingBenchmarkRegressionThresholds = {},
  ): CodingBenchmarkRegressionDecision {
    const current = this.summarize(currentExecutions);
    const regressions: string[] = [];
    const minimumPassRate = thresholds.minimumPassRate ?? 0.8;
    if (current.passRate < minimumPassRate) {
      regressions.push(`Pass rate ${current.passRate.toFixed(3)} is below minimum ${minimumPassRate.toFixed(3)}.`);
    }
    if (baseline) {
      const passDrop = baseline.passRate - current.passRate;
      if (passDrop > (thresholds.maximumPassRateDrop ?? 0)) {
        regressions.push(`Pass rate dropped by ${passDrop.toFixed(3)} from accepted baseline.`);
      }
      this.checkRatio(
        regressions,
        "tokens",
        current.totalTokens,
        baseline.totalTokens,
        thresholds.maximumTokenIncreaseRatio ?? 0.15,
      );
      this.checkRatio(
        regressions,
        "cost",
        current.totalCostUsd,
        baseline.totalCostUsd,
        thresholds.maximumCostIncreaseRatio ?? 0.15,
      );
      this.checkRatio(
        regressions,
        "duration",
        current.totalDurationMs,
        baseline.totalDurationMs,
        thresholds.maximumDurationIncreaseRatio ?? 0.25,
      );
    }
    return {
      accepted: regressions.length === 0,
      regressions,
      current,
      baseline,
    };
  }

  private failure(
    benchmark: CodingBenchmarkCase,
    durationMs: number,
    failureReason: string,
  ): CodingBenchmarkExecution {
    return {
      benchmarkId: benchmark.id,
      language: benchmark.language,
      passed: false,
      durationMs,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      touchedFiles: [],
      verification: [],
      failureReason,
    };
  }

  private checkRatio(
    regressions: string[],
    label: string,
    current: number,
    baseline: number,
    allowedIncreaseRatio: number,
  ): void {
    if (baseline <= 0) return;
    const ratio = (current - baseline) / baseline;
    if (ratio > allowedIncreaseRatio) {
      regressions.push(
        `${label} increased by ${(ratio * 100).toFixed(1)}%; allowed increase is ${(allowedIncreaseRatio * 100).toFixed(1)}%.`,
      );
    }
  }
}
