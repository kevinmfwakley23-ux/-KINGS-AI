import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runPowerhouseEvaluationFiles } from "../../runtimes/powerhouse-evaluation/cli";
import type {
  PowerhouseBenchmarkManifest,
  PowerhouseBenchmarkResponse,
} from "./powerhouse-benchmark-runner";
import { listPowerhouseServiceDomains } from "./powerhouse-service-domain";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function fixture(): {
  manifest: PowerhouseBenchmarkManifest;
  responses: PowerhouseBenchmarkResponse[];
} {
  const items: PowerhouseBenchmarkManifest["items"] = [];
  const responses: PowerhouseBenchmarkResponse[] = [];
  for (const profile of listPowerhouseServiceDomains()) {
    items.push({
      id: `${profile.id}-train`,
      domain: profile.id,
      split: "train",
      sourceGroupId: `${profile.id}-train-source`,
      prompt: `${profile.id} owned training content`,
      critical: false,
      rights: {
        licenseId: "owner-created-v1",
        sourceReference: `${profile.id}:train:source`,
        permissionReference: `${profile.id}:train:permission`,
        permissionEvidenceSha256: "c".repeat(64),
        attestedBy: "rights-reviewer-001",
        trainingAllowed: true,
        evaluationAllowed: false,
      },
    });
    for (let index = 1; index <= 20; index += 1) {
      const taskId = `${profile.id}-held-${index}`;
      items.push({
        id: taskId,
        domain: profile.id,
        split: "held-out",
        sourceGroupId: `${profile.id}-held-source-${index}`,
        prompt: `${profile.id} owned held-out content ${index}`,
        critical: index === 1,
        rights: {
          licenseId: "owner-created-v1",
          sourceReference: `${taskId}:source`,
          permissionReference: `${taskId}:permission`,
          permissionEvidenceSha256: "d".repeat(64),
          attestedBy: "rights-reviewer-001",
          trainingAllowed: false,
          evaluationAllowed: true,
        },
        scoring: {
          kind: "deterministic",
          requiredSubstrings: [`pass-${taskId}`],
        },
      });
      responses.push({
        taskId,
        modelId: "cli-candidate",
        output: `pass-${taskId}`,
        completedAt: "2026-10-24T20:00:00.000Z",
      });
    }
  }
  return {
    manifest: {
      benchmarkId: "cli-seven-domain-benchmark",
      benchmarkVersion: "1.0.0",
      createdAt: "2026-10-24T18:00:00.000Z",
      items,
    },
    responses,
  };
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "kings-powerhouse-evaluation-"));
  try {
    const manifestPath = join(directory, "manifest.json");
    const responsesPath = join(directory, "responses.json");
    const outputPath = join(directory, "evidence.json");
    const data = fixture();
    await writeFile(manifestPath, JSON.stringify(data.manifest), "utf8");
    await writeFile(responsesPath, JSON.stringify(data.responses), "utf8");

    const artifact = await runPowerhouseEvaluationFiles({
      manifestPath,
      responsesPath,
      outputPath,
      modelId: "cli-candidate",
      evaluatedAt: "2026-10-24T21:00:00.000Z",
    });
    const persisted = JSON.parse(await readFile(outputPath, "utf8")) as typeof artifact;
    assert(persisted.schemaVersion === "1", "CLI artifact schema version must be explicit.");
    assert(persisted.benchmarkRun.domainBenchmarks.length === 7, "CLI artifact must contain seven domain reports.");
    assert(persisted.benchmarkRun.taskEvaluations.length === 140, "CLI artifact must contain every task result.");
    assert(
      persisted.qualificationReport.domainBenchmarks.every((result) => result.passedTasks === 20),
      "CLI artifact must be directly consumable by the qualification authority.",
    );
    assert(
      persisted.benchmarkRun.runSha256 === artifact.benchmarkRun.runSha256,
      "Persisted evidence hash must match the returned result.",
    );

    let overwriteRejected = false;
    try {
      await runPowerhouseEvaluationFiles({
        manifestPath,
        responsesPath,
        outputPath: manifestPath,
        modelId: "cli-candidate",
        evaluatedAt: "2026-10-24T21:00:00.000Z",
      });
    } catch (error) {
      overwriteRejected = error instanceof Error && error.message.includes("must not overwrite");
    }
    assert(overwriteRejected, "CLI must not overwrite a manifest or response input.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main()
  .then(() => console.log("Powerhouse evaluation CLI evidence artifact: SUCCESS"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
