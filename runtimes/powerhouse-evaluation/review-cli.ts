import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { PowerhouseBenchmarkManifest } from "../../core/workforce/powerhouse-benchmark-runner";
import {
  applyAuthorizedPowerhouseRubricReviews,
  authorizePowerhouseRubricReviews,
  type PowerhouseRubricReviewArtifact,
  type PowerhouseRubricReviewDraft,
} from "../../core/workforce/powerhouse-rubric-review";
import {
  createPowerhouseEvaluationArtifact,
  readPowerhouseJsonFile,
  writePowerhouseEvaluationArtifact,
} from "./cli";
import { FilePowerhouseBenchmarkCheckpointStore } from "./file-checkpoint-store";

interface ReviewCliOptions {
  manifestPath: string;
  checkpointPath: string;
  draftReviewsPath: string;
  signedReviewsPath: string;
  outputPath: string;
  signedAt: string;
  evaluatedAt: string;
}

function usage(): string {
  return [
    "Usage:",
    "  node build/runtimes/powerhouse-evaluation/review-cli.js \\",
    "    --manifest <private-manifest.json> --checkpoint <checkpoint.json> \\",
    "    --draft-reviews <draft-reviews.json> --signed-reviews <signed-reviews.json> \\",
    "    --output <reviewed-evidence.json> --signed-at <ISO-8601> --evaluated-at <ISO-8601>",
  ].join("\n");
}

function parseArguments(values: string[]): ReviewCliOptions {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(usage());
    if (parsed.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    parsed.set(flag, value);
  }
  const allowed = new Set([
    "--manifest", "--checkpoint", "--draft-reviews", "--signed-reviews", "--output", "--signed-at", "--evaluated-at",
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
    draftReviewsPath: required("--draft-reviews"),
    signedReviewsPath: required("--signed-reviews"),
    outputPath: required("--output"),
    signedAt: required("--signed-at"),
    evaluatedAt: required("--evaluated-at"),
  };
}

async function writeReviewArtifact(pathValue: string, artifact: PowerhouseRubricReviewArtifact): Promise<void> {
  const path = resolve(pathValue);
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function runPowerhouseRubricReview(
  options: ReviewCliOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReturnType<typeof createPowerhouseEvaluationArtifact>> {
  const ownerToken = env.KINGS_CODING_MACHINE_TOKEN?.trim();
  if (!ownerToken || ownerToken.length < 24) {
    throw new Error("Powerhouse rubric review requires KINGS_CODING_MACHINE_TOKEN with at least 24 characters");
  }
  const paths = [
    options.manifestPath,
    options.checkpointPath,
    options.draftReviewsPath,
    options.signedReviewsPath,
    options.outputPath,
  ].map((value) => resolve(value));
  if (new Set(paths).size !== paths.length) {
    throw new Error("Manifest, checkpoint, draft, signed-review, and output paths must be different files");
  }
  const manifest = await readPowerhouseJsonFile(paths[0], "Benchmark manifest") as PowerhouseBenchmarkManifest;
  const draftsValue = await readPowerhouseJsonFile(paths[2], "Rubric review drafts");
  if (!Array.isArray(draftsValue)) throw new Error("Rubric review drafts must be a JSON array");
  const checkpointStore = new FilePowerhouseBenchmarkCheckpointStore(paths[1]);
  const release = await checkpointStore.acquireLock();
  try {
    const checkpoint = await checkpointStore.load();
    if (!checkpoint) throw new Error("Powerhouse execution checkpoint does not exist");
    const reviewArtifact = authorizePowerhouseRubricReviews({
      manifest,
      checkpoint,
      drafts: draftsValue as PowerhouseRubricReviewDraft[],
      ownerToken,
      signedAt: options.signedAt,
    });
    const responses = applyAuthorizedPowerhouseRubricReviews({
      manifest,
      checkpoint,
      artifact: reviewArtifact,
      ownerToken,
    });
    const evidenceArtifact = createPowerhouseEvaluationArtifact(
      checkpoint.modelId,
      options.evaluatedAt,
      manifest,
      responses,
    );
    await writeReviewArtifact(paths[3], reviewArtifact);
    await writePowerhouseEvaluationArtifact(paths[4], evidenceArtifact);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      runId: checkpoint.runId,
      providerId: checkpoint.providerId,
      modelId: checkpoint.modelId,
      reviewsAuthorized: reviewArtifact.reviews.length,
      reviewArtifactSha256: reviewArtifact.artifactSha256,
      benchmarkRunSha256: evidenceArtifact.benchmarkRun.runSha256,
    })}\n`);
    return evidenceArtifact;
  } finally {
    await release();
  }
}

if (require.main === module) {
  runPowerhouseRubricReview(parseArguments(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
