import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PowerhouseBenchmarkManifest } from "./powerhouse-benchmark-runner";
import { listPowerhouseServiceDomains } from "./powerhouse-service-domain";
import { runLivePowerhouseEvaluation } from "../../runtimes/powerhouse-evaluation/live-cli";
import { FilePowerhouseBenchmarkCheckpointStore } from "../../runtimes/powerhouse-evaluation/file-checkpoint-store";
import { runPowerhouseRubricReview } from "../../runtimes/powerhouse-evaluation/review-cli";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function manifest(): PowerhouseBenchmarkManifest {
  const items: PowerhouseBenchmarkManifest["items"] = [];
  for (const profile of listPowerhouseServiceDomains()) {
    items.push({
      id: `${profile.id}-train`,
      domain: profile.id,
      split: "train",
      sourceGroupId: `${profile.id}-train-source`,
      prompt: `${profile.id} private training content`,
      critical: false,
      rights: {
        licenseId: "owner-created-v1",
        sourceReference: `${profile.id}:train:source`,
        permissionReference: `${profile.id}:train:permission`,
        permissionEvidenceSha256: "1".repeat(64),
        attestedBy: "rights-reviewer-001",
        trainingAllowed: true,
        evaluationAllowed: false,
      },
    });
    for (let index = 1; index <= 20; index += 1) {
      const taskId = `${profile.id}-live-${index}`;
      const rubricTask = profile.id === "storytelling" && index === 1;
      items.push({
        id: taskId,
        domain: profile.id,
        split: "held-out",
        sourceGroupId: `${profile.id}-live-source-${index}`,
        prompt: `Private live prompt ${taskId}`,
        critical: index === 1,
        rights: {
          licenseId: "owner-created-v1",
          sourceReference: `${taskId}:source`,
          permissionReference: `${taskId}:permission`,
          permissionEvidenceSha256: "2".repeat(64),
          attestedBy: "rights-reviewer-001",
          trainingAllowed: false,
          evaluationAllowed: true,
        },
        scoring: rubricTask
          ? {
              kind: "attested-rubric",
              rubricId: "storytelling-live-quality-v1",
              minimumScore: 85,
            }
          : {
              kind: "deterministic",
              requiredSubstrings: [`pass-${taskId}`],
            },
      });
    }
  }
  return {
    benchmarkId: "live-cli-seven-domain",
    benchmarkVersion: "1.0.0",
    createdAt: "2026-10-28T16:00:00.000Z",
    items,
  };
}

async function main(): Promise<void> {
  let requests = 0;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
      max_tokens?: number;
    };
    requests += 1;
    assert(request.url === "/v1/chat/completions", "Live CLI must use the configured gateway endpoint.");
    assert(body.model === "locked-model-v1", "Live CLI must preserve the exact model id.");
    assert(body.temperature === 0, "Live CLI must preserve deterministic evaluation temperature.");
    assert(body.max_tokens === 512, "Live CLI must preserve the output-token boundary.");
    assert(
      body.messages[0]?.content.includes("K.I.N.G.S. POWERHOUSE SERVICE DOMAIN") === true,
      "Live CLI must apply the server-owned domain policy.",
    );
    const prompt = body.messages.find((message) => message.role === "user")?.content ?? "";
    const taskId = prompt.replace("Private live prompt ", "");
    const payload = JSON.stringify({
      id: `gateway-${taskId}`,
      choices: [{ message: { content: `pass-${taskId}` } }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    });
    response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
    response.end(payload);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const directory = await mkdtemp(join(tmpdir(), "kings-powerhouse-live-cli-"));
  try {
    const address = server.address() as AddressInfo;
    const manifestPath = join(directory, "manifest.json");
    const checkpointPath = join(directory, "checkpoint.json");
    const outputPath = join(directory, "evidence.json");
    const draftReviewsPath = join(directory, "draft-reviews.json");
    const signedReviewsPath = join(directory, "signed-reviews.json");
    const reviewedOutputPath = join(directory, "reviewed-evidence.json");
    await writeFile(manifestPath, JSON.stringify(manifest()), { encoding: "utf8", mode: 0o600 });
    const options = {
      manifestPath,
      checkpointPath,
      outputPath,
      runId: "live-cli-run-001",
      providerId: "omniroute",
      modelId: "locked-model-v1",
      evaluatedAt: "2026-10-28T18:00:00.000Z",
      concurrency: 4,
      maxAttemptsPerTask: 2,
      retryDelayMs: 1,
      maxOutputTokens: 512,
      temperature: 0,
    };
    const env = {
      // This existing gateway integration test deliberately exercises optional hybrid mode.
      KINGS_INTELLIGENCE_MODE: "hybrid",
      KINGS_CODING_MACHINE_TOKEN: "owner-evaluation-token-0123456789abcdef",
      KINGS_OMNIROUTE_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
      KINGS_OMNIROUTE_MODELS: "locked-model-v1",
    };
    let ownerGateRejected = false;
    try {
      await runLivePowerhouseEvaluation(options, {
        KINGS_OMNIROUTE_BASE_URL: env.KINGS_OMNIROUTE_BASE_URL,
        KINGS_OMNIROUTE_MODELS: env.KINGS_OMNIROUTE_MODELS,
      });
    } catch (error) {
      ownerGateRejected = error instanceof Error && error.message.includes("KINGS_CODING_MACHINE_TOKEN");
    }
    assert(ownerGateRejected, "Live evaluation must fail closed without the configured owner token.");
    assert(requests === 0, "Owner authorization must be checked before any provider request.");
    let sovereignRejected = false;
    try {
      await runLivePowerhouseEvaluation(options, { ...env, KINGS_INTELLIGENCE_MODE: "sovereign" });
    } catch (error) {
      sovereignRejected = error instanceof Error && error.message.includes("unavailable");
    }
    assert(sovereignRejected, "Live benchmark must reject external inference in sovereign mode.");
    assert(requests === 0, "Sovereign rejection must not send any outside model request.");
    const artifact = await runLivePowerhouseEvaluation(options, env);
    assert(requests === 140, "Live CLI must execute every held-out task exactly once.");
    assert(
      artifact.benchmarkRun.domainBenchmarks.find((result) => result.domain === "storytelling")?.passedTasks === 19,
      "Subjective live output must remain failed before authorized review.",
    );
    assert(
      artifact.benchmarkRun.domainBenchmarks.find((result) => result.domain === "storytelling")?.criticalFailures === 1,
      "Missing critical rubric review must remain explicit.",
    );
    const persisted = await readFile(outputPath, "utf8");
    const checkpoint = await readFile(checkpointPath, "utf8");
    assert(!persisted.includes("Private live prompt"), "Final evidence artifact must not expose private prompts.");
    assert(persisted.includes("benchmark-route:sha256:"), "Final evidence must preserve route hashes.");
    assert(!persisted.includes(env.KINGS_CODING_MACHINE_TOKEN), "Evidence artifact must never contain the owner token.");
    assert(!checkpoint.includes(env.KINGS_CODING_MACHINE_TOKEN), "Checkpoint must never contain the owner token.");
    if (process.platform !== "win32") {
      assert(((await stat(checkpointPath)).mode & 0o777) === 0o600, "Checkpoint must be owner-readable only.");
      assert(((await stat(outputPath)).mode & 0o777) === 0o600, "Evidence artifact must be owner-readable only.");
    }

    await writeFile(draftReviewsPath, JSON.stringify([{
      taskId: "storytelling-live-1",
      score: 92,
      evaluatorId: "owner-approved-story-reviewer-001",
      evidenceReference: "review-record:live-storytelling:001",
      evidenceSha256: "7".repeat(64),
      reviewedAt: "2026-10-28T18:15:00.000Z",
    }]), { encoding: "utf8", mode: 0o600 });
    const reviewedArtifact = await runPowerhouseRubricReview({
      manifestPath,
      checkpointPath,
      draftReviewsPath,
      signedReviewsPath,
      outputPath: reviewedOutputPath,
      signedAt: "2026-10-28T18:20:00.000Z",
      evaluatedAt: "2026-10-28T18:30:00.000Z",
    }, env);
    assert(requests === 140, "Rubric review must not rerun the model provider.");
    assert(
      reviewedArtifact.benchmarkRun.domainBenchmarks.every((result) => result.passedTasks === 20),
      "Authorized review must complete the seven-domain benchmark.",
    );
    const signedReviews = await readFile(signedReviewsPath, "utf8");
    assert(!signedReviews.includes(env.KINGS_CODING_MACHINE_TOKEN), "Signed reviews must not contain the owner token.");
    assert(!signedReviews.includes("Private live prompt"), "Signed reviews must not contain private prompts.");
    assert(!signedReviews.includes("pass-storytelling"), "Signed reviews must not contain raw model output.");
    assert(signedReviews.includes("authorizationHmacSha256"), "Signed reviews must preserve owner HMAC evidence.");
    if (process.platform !== "win32") {
      assert(((await stat(signedReviewsPath)).mode & 0o777) === 0o600, "Signed reviews must be owner-readable only.");
      assert(((await stat(reviewedOutputPath)).mode & 0o777) === 0o600, "Reviewed evidence must be owner-readable only.");
    }

    const beforeResume = requests;
    await runLivePowerhouseEvaluation(options, env);
    assert(requests === beforeResume, "Completed checkpoint resume must make zero provider requests.");

    const store = new FilePowerhouseBenchmarkCheckpointStore(checkpointPath);
    const release = await store.acquireLock();
    let lockRejected = false;
    try {
      await runLivePowerhouseEvaluation(options, env);
    } catch (error) {
      lockRejected = error instanceof Error && error.message.includes("locked by another process");
    } finally {
      await release();
    }
    assert(lockRejected, "Concurrent live evaluation must fail closed on the checkpoint lock.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

main()
  .then(() => console.log("Powerhouse provider-connected evaluation CLI: SUCCESS"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
