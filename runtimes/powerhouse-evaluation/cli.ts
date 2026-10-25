import { randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  PowerhouseBenchmarkRunner,
  type PowerhouseBenchmarkManifest,
  type PowerhouseBenchmarkResponse,
} from "../../core/workforce/powerhouse-benchmark-runner";

const MAX_INPUT_BYTES = 32 * 1024 * 1024;

export interface PowerhouseEvaluationCliOptions {
  manifestPath: string;
  responsesPath: string;
  outputPath: string;
  modelId: string;
  evaluatedAt: string;
}

export interface PowerhouseEvaluationArtifact {
  schemaVersion: "1";
  generatedAt: string;
  qualificationReport: {
    modelId: string;
    submittedAt: string;
    domainBenchmarks: ReturnType<PowerhouseBenchmarkRunner["run"]>["domainBenchmarks"];
  };
  benchmarkRun: ReturnType<PowerhouseBenchmarkRunner["run"]>;
}

async function readJsonFile(path: string, label: string): Promise<unknown> {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`${label} must be a regular file`);
  if (metadata.size > MAX_INPUT_BYTES) throw new Error(`${label} exceeds ${MAX_INPUT_BYTES} bytes`);
  const content = await readFile(path, "utf8");
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function runPowerhouseEvaluationFiles(
  options: PowerhouseEvaluationCliOptions,
): Promise<PowerhouseEvaluationArtifact> {
  const manifestPath = resolve(options.manifestPath);
  const responsesPath = resolve(options.responsesPath);
  const outputPath = resolve(options.outputPath);
  if (outputPath === manifestPath || outputPath === responsesPath) {
    throw new Error("Output path must not overwrite an input file");
  }

  const manifest = await readJsonFile(manifestPath, "Benchmark manifest") as PowerhouseBenchmarkManifest;
  const responsesValue = await readJsonFile(responsesPath, "Benchmark responses");
  if (!Array.isArray(responsesValue)) throw new Error("Benchmark responses must be a JSON array");
  const benchmarkRun = new PowerhouseBenchmarkRunner().run({
    modelId: options.modelId,
    evaluatedAt: options.evaluatedAt,
    manifest,
    responses: responsesValue as PowerhouseBenchmarkResponse[],
  });
  const artifact: PowerhouseEvaluationArtifact = {
    schemaVersion: "1",
    generatedAt: options.evaluatedAt,
    qualificationReport: {
      modelId: options.modelId,
      submittedAt: options.evaluatedAt,
      domainBenchmarks: benchmarkRun.domainBenchmarks,
    },
    benchmarkRun,
  };

  const temporaryPath = `${outputPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return artifact;
}

function usage(): string {
  return [
    "Usage:",
    "  node build/runtimes/powerhouse-evaluation/cli.js \\",
    "    --manifest <manifest.json> --responses <responses.json> \\",
    "    --model <model-id> --evaluated-at <ISO-8601> --output <artifact.json>",
  ].join("\n");
}

function parseArguments(values: string[]): PowerhouseEvaluationCliOptions {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(usage());
    }
    if (parsed.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    parsed.set(flag, value);
  }
  const allowed = new Set(["--manifest", "--responses", "--model", "--evaluated-at", "--output"]);
  for (const flag of parsed.keys()) {
    if (!allowed.has(flag)) throw new Error(`Unknown option: ${flag}\n${usage()}`);
  }
  const required = (flag: string): string => {
    const value = parsed.get(flag)?.trim();
    if (!value) throw new Error(`Missing required option: ${flag}\n${usage()}`);
    return value;
  };
  return {
    manifestPath: required("--manifest"),
    responsesPath: required("--responses"),
    modelId: required("--model"),
    evaluatedAt: required("--evaluated-at"),
    outputPath: required("--output"),
  };
}

async function main(): Promise<void> {
  const artifact = await runPowerhouseEvaluationFiles(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({
    ok: true,
    modelId: artifact.benchmarkRun.modelId,
    benchmarkId: artifact.benchmarkRun.benchmarkId,
    runSha256: artifact.benchmarkRun.runSha256,
    domains: artifact.benchmarkRun.domainBenchmarks.map((result) => ({
      domain: result.domain,
      passedTasks: result.passedTasks,
      totalTasks: result.totalTasks,
      criticalFailures: result.criticalFailures,
    })),
  })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
