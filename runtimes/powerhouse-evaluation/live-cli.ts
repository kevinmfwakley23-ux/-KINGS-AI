import { resolve } from "node:path";

import { AppAiRouter } from "../../core/workforce/app-ai-router";
import { PowerhouseBenchmarkExecutor } from "../../core/workforce/powerhouse-benchmark-executor";
import type { PowerhouseBenchmarkManifest } from "../../core/workforce/powerhouse-benchmark-runner";
import { createConfiguredGatewayAdapters } from "../../core/workforce/openai-compatible-gateway";
import { createConfiguredOllamaAdapter } from "../../core/workforce/ollama-provider-adapter";
import { ProviderAdapterRegistry } from "../../core/workforce/provider-adapters";
import { listPowerhouseServiceDomains } from "../../core/workforce/powerhouse-service-domain";
import {
  createPowerhouseEvaluationArtifact,
  readPowerhouseJsonFile,
  writePowerhouseEvaluationArtifact,
} from "./cli";
import { FilePowerhouseBenchmarkCheckpointStore } from "./file-checkpoint-store";

interface LiveCliOptions {
  manifestPath: string;
  checkpointPath: string;
  outputPath: string;
  runId: string;
  providerId: string;
  modelId: string;
  evaluatedAt: string;
  concurrency: number;
  maxAttemptsPerTask: number;
  retryDelayMs: number;
  maxOutputTokens: number;
  temperature: number;
}

function usage(): string {
  return [
    "Usage:",
    "  node build/runtimes/powerhouse-evaluation/live-cli.js \\",
    "    --manifest <private-manifest.json> --checkpoint <checkpoint.json> \\",
    "    --output <evidence.json> --run-id <immutable-run-id> \\",
    "    --provider <configured-provider-id> --model <exact-model-id> \\",
    "    --evaluated-at <ISO-8601> [--concurrency 1] [--max-attempts 2] \\",
    "    [--retry-delay-ms 1000] [--max-output-tokens 2048] [--temperature 0]",
  ].join("\n");
}

function numberOption(parsed: Map<string, string>, flag: string, fallback: number): number {
  const raw = parsed.get(flag);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${flag} must be numeric`);
  return value;
}

function parseArguments(values: string[]): LiveCliOptions {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(usage());
    if (parsed.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    parsed.set(flag, value);
  }
  const allowed = new Set([
    "--manifest", "--checkpoint", "--output", "--run-id", "--provider", "--model", "--evaluated-at",
    "--concurrency", "--max-attempts", "--retry-delay-ms", "--max-output-tokens", "--temperature",
  ]);
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
    checkpointPath: required("--checkpoint"),
    outputPath: required("--output"),
    runId: required("--run-id"),
    providerId: required("--provider"),
    modelId: required("--model"),
    evaluatedAt: required("--evaluated-at"),
    concurrency: numberOption(parsed, "--concurrency", 1),
    maxAttemptsPerTask: numberOption(parsed, "--max-attempts", 2),
    retryDelayMs: numberOption(parsed, "--retry-delay-ms", 1_000),
    maxOutputTokens: numberOption(parsed, "--max-output-tokens", 2_048),
    temperature: numberOption(parsed, "--temperature", 0),
  };
}

function createProviders(env: NodeJS.ProcessEnv): ProviderAdapterRegistry {
  const providers = new ProviderAdapterRegistry();
  for (const adapter of createConfiguredGatewayAdapters(env)) providers.register(adapter);
  const ollama = createConfiguredOllamaAdapter(env);
  if (ollama) providers.register(ollama);
  return providers;
}

export async function runLivePowerhouseEvaluation(
  options: LiveCliOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReturnType<typeof createPowerhouseEvaluationArtifact>> {
  const ownerToken = env.KINGS_CODING_MACHINE_TOKEN?.trim();
  if (!ownerToken || ownerToken.length < 24) {
    throw new Error(
      "Live Powerhouse evaluation requires KINGS_CODING_MACHINE_TOKEN with at least 24 characters",
    );
  }
  const manifestPath = resolve(options.manifestPath);
  const checkpointPath = resolve(options.checkpointPath);
  const outputPath = resolve(options.outputPath);
  if (new Set([manifestPath, checkpointPath, outputPath]).size !== 3) {
    throw new Error("Manifest, checkpoint, and output paths must be different files");
  }
  const manifest = await readPowerhouseJsonFile(manifestPath, "Benchmark manifest") as PowerhouseBenchmarkManifest;
  const providers = createProviders(env);
  const provider = providers.get(options.providerId);
  if (!provider || !provider.descriptor.available) {
    throw new Error(`Configured provider "${options.providerId}" is unavailable`);
  }
  const model = provider.listModels().find((candidate) => candidate.modelId === options.modelId);
  if (!model || !model.available) {
    throw new Error(`Model "${options.modelId}" is not available from provider "${options.providerId}"`);
  }
  const requiredCapabilities = [...new Set(
    listPowerhouseServiceDomains().flatMap((profile) => profile.requiredCapabilities),
  )];
  const missingCapabilities = requiredCapabilities.filter((capability) => !model.capabilities.includes(capability));
  if (missingCapabilities.length > 0) {
    throw new Error(
      `Model "${options.modelId}" cannot run the complete seven-domain suite; missing: ${missingCapabilities.join(", ")}`,
    );
  }

  const checkpointStore = new FilePowerhouseBenchmarkCheckpointStore(checkpointPath);
  const release = await checkpointStore.acquireLock();
  try {
    const router = new AppAiRouter(providers, [options.providerId]);
    const execution = await new PowerhouseBenchmarkExecutor(router).execute({
      runId: options.runId,
      providerId: options.providerId,
      modelId: options.modelId,
      manifest,
      checkpointStore,
      concurrency: options.concurrency,
      maxAttemptsPerTask: options.maxAttemptsPerTask,
      retryDelayMs: options.retryDelayMs,
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature,
    });
    const artifact = createPowerhouseEvaluationArtifact(
      options.modelId,
      options.evaluatedAt,
      manifest,
      execution.responses,
    );
    await writePowerhouseEvaluationArtifact(outputPath, artifact);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      runId: options.runId,
      providerId: options.providerId,
      modelId: options.modelId,
      executedTasks: execution.executedTasks,
      resumedTasks: execution.resumedTasks,
      succeededTasks: execution.succeededTasks,
      failedTasks: execution.failedTasks,
      runSha256: artifact.benchmarkRun.runSha256,
    })}\n`);
    return artifact;
  } finally {
    await release();
  }
}

if (require.main === module) {
  runLivePowerhouseEvaluation(parseArguments(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
